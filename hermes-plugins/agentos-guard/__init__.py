"""agentos-guard — role-based tool guard for AgentOS bots (Hermes plugin).

Enforces, at the tool boundary, what the SOUL only asks for:
  * chief of staff: no producing (no code/config writes, no installs/builds/commits, no code execution)
  * reviewer: read-only on deliverables (no edits/commits/installs), verification commands allowed
  * every role: a per-session tool-call budget

Decision precedence per call: budget -> tools.deny -> skill_manage actions -> write paths/ext ->
terminal allow/deny. ``mode: warn`` logs what WOULD be blocked and lets the call through; ``mode:
block`` returns ``{"action": "block", "message"}`` which the agent receives as the tool result.

Config (profile config.yaml):
    plugins:
      enabled: [agentos-guard]
      entries:
        agentos-guard:
          settings: { role: chief, mode: warn }
Rules: ``rules.yaml`` next to this file. Log: ``$HERMES_HOME/logs/guard.jsonl`` (one JSON per decision).
"""

from __future__ import annotations

import fnmatch
import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_HERE = Path(__file__).resolve().parent
_VALID_ROLES = ("chief", "reviewer", "worker", "basic")
_VALID_MODES = ("warn", "block")
_WRITE_TOOLS = {"write_file": "path", "patch": "path", "skill_manage": "file_path"}
_TERMINAL_TOOLS = ("terminal", "process_manage")


_HEREDOC_OPEN = re.compile(r"<<(-?)\s*(['\"]?)(\w+)\2")


def _split_command_line(cmd: str) -> List[str]:
    """Split a shell command line into pipeline/sequence segments (``|``, ``&&``, ``||``, ``;``, newline),
    ignoring separators inside single/double quotes and inside heredoc bodies (``<<EOF`` … ``EOF``).

    A heredoc body is attached to the segment that *opened* it, wherever the opener sits on its line
    (``curl … <<'EOF' -o out``, ``curl … <<'EOF' | node …``), and commands after the terminator line become
    their own segments — the same reading bash does — so ``_HEREDOC_BODY`` always finds opener + body +
    terminator inside one segment."""
    segs: List[List[str]] = []
    buf: List[str] = []
    quote: Optional[str] = None
    pending: List["tuple[str, List[str]]"] = []  # (terminator, segment that opened it) waiting for the next newline
    i = 0
    while i < len(cmd):
        ch = cmd[i]
        if ch == "\\" and quote != "'" and i + 1 < len(cmd):  # backslash escape (bash): `\"` inside "…", `\|` outside
            if cmd.startswith(("\n", "\r\n"), i + 1):  # line continuation: bash drops it, the line goes on
                buf.append(" "); i += 2 if cmd[i + 1] == "\n" else 3
                continue
            buf.append(cmd[i:i + 2]); i += 2
            continue
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
            buf.append(ch)
        elif cmd.startswith("<<<", i):  # here-string, not a heredoc
            buf.append("<<<"); i += 3
            continue
        elif ch == "<" and (m := _HEREDOC_OPEN.match(cmd, i)):
            buf.append(m.group(0))
            pending.append((m.group(3), buf))
            i = m.end()
            continue
        elif cmd.startswith(("||", "&&"), i):
            segs.append(buf); buf = []; i += 1
        elif ch == "\n" and pending:
            segs.append(buf); buf = []
            i += 1
            for term, owner in pending:  # bodies follow in opener order, each up to its terminator line
                body: List[str] = []
                closed = False
                while i < len(cmd):
                    nl = cmd.find("\n", i)
                    line = cmd[i:] if nl < 0 else cmd[i:nl]
                    i = len(cmd) if nl < 0 else nl + 1
                    if line.strip() == term:
                        closed = True
                        break
                    body.append(line)
                owner.append("\n" + "\n".join(body) + ("\n" + term if closed else ""))
            pending = []
            continue
        elif ch in "|;\n":
            segs.append(buf); buf = []
        else:
            buf.append(ch)
        i += 1
    segs.append(buf)
    return [s for s in ("".join(b).strip() for b in segs) if s]


_QUOTED = re.compile(r"\"(?:\\.|[^\"\\])*\"|'[^']*'", re.S)
_HEREDOC_BODY = re.compile(r"(<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n)(.*?)(\n\s*\2\s*$)", re.S)


def _strip_data(seg: str) -> "tuple[str, List[str]]":
    """Return ``(shape, quoted)``: the segment with heredoc bodies removed and every quoted string replaced
    by a numbered placeholder (``"Q3"``), plus the original quoted strings. Rules match on the shape, so
    payload text (a comment that merely mentions ``npm``) never triggers a rule; the redirect check
    resolves a quoted target back through ``quoted``."""
    seg = _HEREDOC_BODY.sub(lambda m: m.group(1) + m.group(4), seg)
    quoted: List[str] = []

    def _sub(m: "re.Match[str]") -> str:
        quoted.append(m.group(0)[1:-1])
        return f'{m.group(0)[0]}Q{len(quoted) - 1}{m.group(0)[-1]}'

    return _QUOTED.sub(_sub, seg), quoted


_PY_INLINE = re.compile(r"^python3?\s+-c\s+[\"']Q(\d+)[\"']", re.S)
_JS_INLINE = re.compile(r"^node\s+(-e|--eval|-p|--print)\s+[\"']Q(\d+)[\"']", re.S)
_PY_DANGER = re.compile(r"subprocess|os\.system|os\.popen|os\.remove|os\.unlink|os\.rename|os\.makedirs|shutil\.|"
                        r"open\([^)]*,\s*(mode\s*=\s*)?['\"][wax]|\.write_text\(|\.write_bytes\(|\bexec\(|\beval\(|__import__")
_JS_DANGER = re.compile(r"child_process|\bexec(Sync|File)?\(|\bspawn(Sync)?\(|writeFile(Sync)?\(|appendFile(Sync)?\(|"
                        r"\bunlink(Sync)?\(|\brm(Sync)?\(|\bmkdir(Sync)?\(|\brename(Sync)?\(|createWriteStream|\beval\(|new Function\(")
# stdout/stderr redirect into a file: allowed only into scratch/evidence locations. Runs on the shape, so a
# JS/Python arrow ``=>`` inside a quoted program never looks like a redirect; a quoted target ``> "Q2"`` is
# resolved through the quoted list.
_REDIRECT = re.compile(r"(?<![<>&\d])\d?>{1,2}\s*(?!&)\s*(?:[\"']Q(\d+)[\"']|([^\s\"'&|;]+))")
_REDIRECT_OK = re.compile(r"(scratch|Temp|TMPDIR|TMP|TEMP|-evidence)[/\\]", re.I)
# Interpreters that would take a whole new command line as data — always refused, regardless of quoting.
_SHELL_ESCAPE = re.compile(r"^(bash|sh|zsh|dash|cmd(\.exe)?|powershell(\.exe)?|pwsh|wsl)\b.*\s(-c|/c|-Command|-EncodedCommand|--)\s", re.I)
# `A=1 B="x" timeout 60 prog …` runs prog: the allow/deny lists judge prog. A value holding a command
# substitution (`SHA=$(git …)`) is not peeled — that segment is an assignment and stays one.
_RUN_PREFIX = re.compile(r"^(?:[A-Za-z_][A-Za-z0-9_]*=(?:[\"']Q\d+[\"']|[^\s\"'$`]*)\s+|timeout\s+\d+[smhd]?\s+)+")
_QPLACE = re.compile(r"^[\"']Q(\d+)[\"']$")
_PY_EXE = re.compile(r"^(python3?|py)(\.exe)?$", re.I)
_NODE_EXE = re.compile(r"^node(\.exe)?$", re.I)
# SQL writes and commits from a Python program (sqlite3 etc.)
_PY_SQL_WRITE = re.compile(r"\.(execute|executemany|executescript)\(\s*[rRbBfFuU]?[\"']{1,3}\s*(insert|update|delete|drop|alter|create|replace|vacuum|attach)\b|\.commit\(\)", re.I)


def _run_shape(shape: str) -> str:
    """The shape with leading env assignments / ``timeout N`` peeled off (unchanged when nothing follows)."""
    m = _RUN_PREFIX.match(shape)
    return shape[m.end():] if m and shape[m.end():].strip() else shape


def _resolve_head(shape: str, quoted: List[str]) -> str:
    """The shape with the program and its first argument un-quoted (``node "Q0" hire`` → ``node C:/…/hermes-bots.mjs
    hire``) so the allow list can name a quoted script path. Only the first two tokens: payload text stays hidden."""
    parts = shape.split(None, 2)
    for i in range(min(2, len(parts))):
        if m := _QPLACE.match(parts[i]):
            parts[i] = quoted[int(m.group(1))].replace(" ", "_")
    return " ".join(parts)


def _prog_name(tok: str, quoted: List[str]) -> str:
    """Basename of a command token, resolving a quoted placeholder (``"Q3"`` → ``.../python.exe`` → ``python.exe``)."""
    if m := _QPLACE.match(tok):
        tok = quoted[int(m.group(1))]
    return re.split(r"[/\\]", tok)[-1]


def _inline_program(seg: str, shape: str, quoted: List[str]) -> "Optional[tuple[str, Any, str]]":
    """``(code, danger_pattern, label)`` when the segment runs a Python/Node program whose source is visible in
    the command — ``python -c "…"``, ``node -e "…"``, or ``python - <<'PY' … PY`` / ``node <<'JS' … JS`` — else None."""
    parts = shape.split(None, 1)
    if not parts:
        return None
    prog = _prog_name(parts[0], quoted)
    is_py, is_js = bool(_PY_EXE.match(prog)), bool(_NODE_EXE.match(prog))
    if not (is_py or is_js):
        return None
    rest = parts[1] if len(parts) > 1 else ""
    danger, kind = (_PY_DANGER, "python") if is_py else (_JS_DANGER, "node")
    flag = r"-c" if is_py else r"(?:-e|--eval|-p|--print)"
    if m := re.match(flag + r"\s+[\"']Q(\d+)[\"']", rest):
        return (quoted[int(m.group(1))], danger, f"{kind} {'-c' if is_py else '-e'}")
    # stdin program: `python - [args…] <<'PY'` or `python <<'PY'` (not `python script.py <<EOF`: there the heredoc is data)
    if re.match(r"(?:-(?:\s+(?:[\"']Q\d+[\"']|[^\s<|;&]+))*\s+)?<<-?\s*['\"]?\w+['\"]?(\s|$)", rest) and (b := _HEREDOC_BODY.search(seg)):
        return (b.group(3), danger, f"{kind} heredoc")
    return None


# open("<literal path>", "w"/"a"/"x") inside a Python program — the only file write we can locate statically.
_PY_OPEN_LITERAL = re.compile(r"open\(\s*[rRfF]?([\"'])([^\"'\n]+)\1\s*,\s*(?:mode\s*=\s*)?[rRbB]?[\"'][wax]")


def _py_danger(code: str, cwd: Optional[str], env: Dict[str, str]) -> "Optional[str]":
    """First forbidden operation in a Python program, or None. ``open(path, 'w')`` is allowed when *path*
    resolves into a scratch/evidence folder — the same places a ``>`` redirect may write to."""
    for m in _PY_DANGER.finditer(code):
        hit = m.group(0)
        if hit.startswith("open("):
            w = _PY_OPEN_LITERAL.match(code, m.start())
            # f"facts/{key}.json": the braces may only fill in a file name below the resolved folder
            target = re.sub(r"\{[^}]*\}", "x", w.group(2)) if w else ""
            if w and ".." not in w.group(2) and not w.group(2).lstrip().startswith("{"):
                p = _expand_path(target, cwd, env)
                if p is not None and _REDIRECT_OK.search(str(p).replace("\\", "/") + "/"):
                    continue
        return hit
    if m := _PY_SQL_WRITE.search(code):
        return m.group(0)
    return None


def _path_matches(norm: str, globs: List[str]) -> bool:
    """fnmatch with ``**/`` also matching zero directories (``**/workspace/x.md`` ~ ``workspace/x.md``)."""
    for g in globs:
        candidates = {g}
        if g.startswith("**/"):
            candidates.add(g[3:])
        if "/**/" in g:
            candidates |= {c.replace("/**/", "/") for c in list(candidates)}
        if any(fnmatch.fnmatch(norm, c) for c in candidates):
            return True
    return False


class TitleRules:
    """Human-readable issue title policy (rules.yaml `issue_title`). Checked when a bot creates/renames an
    issue through the Paperclip API, so titles like `조직도 › 검수봇-1 › 반려시험-1` are refused with a fix hint."""

    def __init__(self, cfg: Dict[str, Any]):
        self.sep = str(cfg.get("separator") or "›")
        self.min_parts = int(cfg.get("min_parts") or 2)
        self.max_parts = int(cfg.get("max_parts") or 3)
        self.leaf_min = int(cfg.get("leaf_min_chars") or 8)
        self.leaf_max = int(cfg.get("leaf_max_chars") or 40)
        self.action_words = [str(w) for w in (cfg.get("action_words") or [])]
        self.action_suffixes = [str(w) for w in (cfg.get("action_suffixes") or ["하기"])]
        self.forbidden = [re.compile(p) for p in (cfg.get("forbidden_patterns") or [])]
        self.skip_prefixes = [str(p) for p in (cfg.get("skip_prefixes") or ["[보관]"])]
        self.example = str(cfg.get("example") or "홈페이지 › 가을 발효 클래스 인스타 홍보문구 1개 작성")
        self._action_re = re.compile(r"(" + "|".join(map(re.escape, self.action_words)) + r")\s*$") if self.action_words else None

    def check(self, title: str) -> Optional[str]:
        t = title.strip()
        if not t or any(t.startswith(p) for p in self.skip_prefixes):
            return None
        parts = [p.strip() for p in t.split(self.sep)]
        hint = f"규칙: <영역> {self.sep} <무엇을 어떻게 한다> (2~{self.max_parts}칸, 마지막 칸 {self.leaf_min}~{self.leaf_max}자, 끝이 동작어). 예) {self.example}"
        if len(parts) < self.min_parts or len(parts) > self.max_parts or any(not p for p in parts):
            return f"작업 제목 형식 위반(칸 수 {len(parts)}): `{t}` — {hint}"
        leaf = parts[-1]
        for pat in self.forbidden:
            if pat.search(leaf):
                return f"작업 제목 형식 위반(금지 표현 '{pat.pattern}'): `{t}` — {hint}"
        n = len(leaf)
        if n < self.leaf_min or n > self.leaf_max:
            return f"작업 제목 형식 위반(마지막 칸 {n}자): `{t}` — {hint}"
        if self._action_re and not (self._action_re.search(leaf) or any(leaf.endswith(s) for s in self.action_suffixes)):
            return (f"작업 제목 형식 위반(마지막 칸이 동작어로 끝나지 않음): `{t}` — {hint} "
                    f"(동작어: {', '.join(self.action_words[:12])}…)")
        return None


class CommentRules:
    """Evidence gate (rules.yaml `issue_comment`). A `status: done` transition must carry a completion comment with
    the required labels and a real evidence pointer; a reviewer's `status: in_progress` (reject) must carry the
    reject labels. Format only — whether the evidence is true is the reviewer's job."""

    def __init__(self, cfg: Dict[str, Any], check_done: bool, check_reject: bool):
        self.on_done, self.on_reject = check_done, check_reject
        d = cfg.get("done") or {}
        self.done_labels = [[str(a) for a in (x if isinstance(x, list) else [x])] for x in (d.get("labels") or [])]
        self.done_optional_empty = set(str(x) for x in (d.get("optional_empty") or []))
        self.evidence_label = str(d.get("evidence_label") or "증거")
        self.evidence_re = re.compile(str(d.get("evidence_pattern") or r"https?://|[/\\]|\b[0-9a-f]{7,40}\b"))
        self.method_label = str(d.get("method_label") or "확인 방법")
        self.method_bad = [re.compile(p) for p in (d.get("method_bad_patterns") or [])]
        self.forbidden = [re.compile(p) for p in (d.get("forbidden_patterns") or [])]
        self.done_example = str(d.get("example") or "")
        rj = cfg.get("reject") or {}
        self.reject_labels = [[str(a) for a in (x if isinstance(x, list) else [x])] for x in (rj.get("labels") or [])]
        self.reject_example = str(rj.get("example") or "")
        self.min_value = int(cfg.get("min_value_chars") or 3)

    @staticmethod
    def _values(comment: str, aliases: List[str]) -> Optional[str]:
        """Value after `- <label>:` (any alias) on its line, or None when the label is absent."""
        for a in aliases:
            m = re.search(r"^\s*[-*•]?\s*(?:\*\*)?" + re.escape(a) + r"(?:\*\*)?\s*[:：]\s*(.*)$", comment, re.M)
            if m:
                return m.group(1).strip()
            # heading form: "### 한 일" followed by its section (until the next heading)
            m = re.search(r"^\s{0,3}#{1,6}\s*" + re.escape(a) + r"\s*$\n((?:(?!^\s{0,3}#{1,6}\s).*\n?)*)", comment, re.M)
            if m:
                return m.group(1).strip()
        return None

    def _check_labels(self, comment: str, labels: List[List[str]], optional_empty: set, kind: str, example: str) -> Optional[str]:
        missing, empty = [], []
        for aliases in labels:
            v = self._values(comment, aliases)
            if v is None:
                missing.append(aliases[0])
            elif len(v) < self.min_value and aliases[0] not in optional_empty:
                empty.append(aliases[0])
        if missing or empty:
            what = (f"누락 {', '.join(missing)}" if missing else "") + (" / " if missing and empty else "") + (f"비어 있음 {', '.join(empty)}" if empty else "")
            return f"{kind} 댓글 형식 위반({what}). 필수 양식:\n{example}"
        return None

    def check_done(self, comment: str) -> Optional[str]:
        if r := self._check_labels(comment, self.done_labels, self.done_optional_empty, "완료", self.done_example):
            return r
        ev = self._values(comment, next((a for a in self.done_labels if a[0] == self.evidence_label), [self.evidence_label])) or ""
        if not self.evidence_re.search(ev):
            return f"완료 댓글 형식 위반(증거에 경로·URL·commit·revision 중 하나가 없음: `{ev[:60]}`). 필수 양식:\n{self.done_example}"
        method = self._values(comment, next((a for a in self.done_labels if a[0] == self.method_label), [self.method_label])) or ""
        for p in self.method_bad:
            if p.search(method):
                return f"완료 댓글 형식 위반(확인 방법이 '{method[:40]}'처럼 결과만 주장함 — 어떤 명령/절차로 확인했는지 적을 것). 필수 양식:\n{self.done_example}"
        for p in self.forbidden:
            if m := p.search(comment):
                return f"완료 댓글 형식 위반(모호한 표현 '{m.group(0)}' — 정확히 무엇을 했는지 적을 것). 필수 양식:\n{self.done_example}"
        return None

    def check_reject(self, comment: str) -> Optional[str]:
        return self._check_labels(comment, self.reject_labels, set(), "반려", self.reject_example)

    def check_body(self, body: Dict[str, Any]) -> Optional[str]:
        """Apply to a parsed Paperclip issue PATCH/POST body."""
        status = body.get("status")
        comment = body.get("comment")
        if not isinstance(status, str):
            return None
        if status == "done" and self.on_done:
            return self.check_done(comment if isinstance(comment, str) else "")
        if status == "in_progress" and self.on_reject and isinstance(comment, str):
            return self.check_reject(comment)
        return None


# Paperclip issue create/rename: a curl with a body (-d/--data*/heredoc) whose URL ends in /issues or /issues/<id>
# (comments/documents/execution sub-paths are excluded by the URL regex). Legacy matchers — used by roles without
# `strict_issue_calls`; kept byte-identical so chief/reviewer behaviour does not move.
_ISSUE_CALL_LEGACY = re.compile(r"^curl\b.*(\s-d\b|\s--data(-binary|-raw)?\b|\s-X\s*(POST|PATCH)\b|<<)")
_ISSUE_URL_LEGACY = re.compile(r"/api/(companies/[^/\s\"']+/)?issues(/[0-9a-f-]{36})?[\"']?(\s|$)")
# Strict matchers (`strict_issue_calls: true`): also -d without a space, --json, PUT, and issue keys (HER-38) or
# ?query/#fragment tails in the URL.
_ISSUE_CALL = re.compile(r"^curl\b.*(\s-d|\s--data(-binary|-raw|-ascii|-urlencode)?\b|\s--json\b|\s-X\s*(POST|PATCH|PUT)\b|<<)")
_ISSUE_URL = re.compile(r"/api/(companies/[^/\s\"']+/)?issues(/[^/\s\"'?#]+)?([?#][^\s\"']*)?[\"']?(\s|$)")
# curl body arguments on the shape: -d X, -dX, --data=X, --json X …
_BODY_FLAG = re.compile(r"(?:^|\s)(?:-d|--data(?:-binary|-raw|-ascii|-urlencode)?|--json)(?:\s+|=|(?=[\"'@$`]))(\S+)")
_QTOK = re.compile(r"([\"'])Q(\d+)\1")
# Non-curl HTTP clients. Roles with issue rules must use curl so the gate can read the body.
_OTHER_HTTP = re.compile(r"^(wget|http|https|xh|httpie|aria2c|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)(\.exe)?\b", re.I)
_OPAQUE_HINT = ("guard가 본문을 확인할 수 없습니다 — curl -d '<JSON>'(작은따옴표) / heredoc(<<'EOF') / "
                "이미 만들어 둔 파일(-d @절대경로) 중 하나로 보내세요.")
_TITLE_JSON = re.compile(r"\"title\"\s*:\s*\"((?:\\.|[^\"\\])*)\"")


def _issue_titles_from_json(text: Any) -> List[str]:
    if not isinstance(text, str) or "\"title\"" not in text:
        return []
    out = []
    for m in _TITLE_JSON.finditer(text):
        try:
            out.append(json.loads(f'"{m.group(1)}"'))
        except ValueError:
            out.append(m.group(1))
    return out


def _issue_body_from_json(text: Any) -> Optional[Dict[str, Any]]:
    """Whole-object parse of a Paperclip issue body (for status/comment). Tolerates `$VAR` shell text around it."""
    if not isinstance(text, str) or "\"status\"" not in text:
        return None
    s, e = text.find("{"), text.rfind("}")
    if s < 0 or e <= s:
        return None
    try:
        obj = json.loads(text[s:e + 1])
    except ValueError:
        return None
    return obj if isinstance(obj, dict) else None


# A program (script file, python -c, node -e) that itself sends an issue status transition hides the comment from
# the gate. Roles with comment rules must do status transitions with a visible JSON body (curl -d / heredoc / @file).
_PROGRAM_TRANSITION = re.compile(r"[\"']status[\"']\s*[:=]\s*[\"'](done|in_progress)[\"']")
_PROGRAM_ISSUE_API = re.compile(r"/issues\b|/api/issues|issues/\{|issues/\$|PAPERCLIP_API_URL|paperclip", re.I)
_PROGRAM_EXT = (".py", ".mjs", ".cjs", ".js", ".ts", ".sh", ".ps1")


def _hidden_transition(text: Any, strict: bool = False) -> bool:
    if not isinstance(text, str) or not text.strip():
        return False
    if _issue_body_from_json(text) is not None:
        return False  # plain JSON body — the gate can read it
    pat = _PROGRAM_TRANSITION_STRICT if strict else _PROGRAM_TRANSITION
    return bool(pat.search(text) and _PROGRAM_ISSUE_API.search(text))


# Strict: also JS/Python unquoted keys ({status:"done"}, dict(status="done")).
_PROGRAM_TRANSITION_STRICT = re.compile(r"(?:[\"']|\b)status[\"']?\s*[:=]\s*[\"'](done|in_progress)[\"']")
# Programs that read their source from a heredoc (python - <<'PY', node <<'JS', pwsh <<…) or from a script file.
_HEREDOC_PROGRAM = re.compile(r"^(python3?|py|node|deno|bun|pwsh|powershell|ruby|perl)(\.exe)?\b", re.I)
_SCRIPT_RUN = re.compile(r"^(?:python3?|py|node|deno(?:\s+run)?|bun|bash|sh|pwsh|powershell)(?:\.exe)?\s+(?:-[-\w=]+\s+)*"
                         r"(?:[\"']Q(\d+)[\"']|(\S+\.(?:py|mjs|cjs|js|ts|sh|ps1)))", re.I)
# Segments that cannot create or change a file — an @file body is only trusted when every earlier segment of the
# same command line is one of these (otherwise the file may have been produced moments before, unseen).
_READONLY_SEG = re.compile(r"^(cd|pushd|ls|dir|cat|type|grep|rg|head|tail|wc|echo|printf|test|\[|jq|pwd|date|sleep|"
                           r"true|false|export|which|where|stat|file|diff|sort|uniq|cut|tr|cygpath|realpath|basename|dirname)\b")
_ASSIGN_SEG = re.compile(r"^(?:export\s+)?([A-Za-z_]\w*)=(?:[\"']Q(\d+)[\"']|(\S*))$")
_CD_SEG = re.compile(r"^(?:cd|pushd)\s+(?:[\"']Q(\d+)[\"']|(\S+))$")
_WRITE_VERB = re.compile(r"^(sudo\s+)?(rm|del|erase|rmdir|rd|mv|move|ren|rename|cp|copy|xcopy|robocopy|tee|truncate|shred|"
                         r"unlink|ln|install|chmod|chown|touch|Remove-Item|ri|Set-Content|Add-Content|Out-File|Copy-Item|"
                         r"Move-Item|Rename-Item|New-Item|Clear-Content)\b|\bsed\s+(-\w+\s+)*-i", re.I)
_LAST_ARG_ONLY = re.compile(r"^(sudo\s+)?(cp|copy|xcopy|robocopy|ln|install|Copy-Item)\b", re.I)
_OUTPUT_FLAG = re.compile(r"(?:^|\s)(?:-o|--output|-OutFile)(?:\s+|=)(?:[\"']Q(\d+)[\"']|(\S+))")
_CODE_TOOLS = ("execute_code", "code_execution")
_READ_TOOLS = {"read_file": "path", "search_files": "path"}

# ---- W6-X1 (2026-10-07 follow-up): worker terminal = program ALLOW list (roles.<r>.terminal.allow_programs) ----
# Every program a command line would start — each segment, `$(…)`/backtick substitutions, `bash -c` / `wsl …` command
# strings, `find -exec`, wrapper builtins — is reduced to a plain lower-case name (quotes joined, path and .exe
# dropped, variables resolved) and must be on the list. Shell syntax words are not programs. What it does not see:
# what an allowed program does next (a script file, `npm run`, a git hook). Same OS account → speed bump, not a wall.
_SHELL_WORDS = {"do", "then", "else", "elif", "if", "while", "until", "!", "{", "(", "time"}
_SHELL_SKIP = {"for", "case", "select", "done", "fi", "esac", "}", ")", "in", ";;"}
_WRAPPERS = {"nohup", "exec", "command", "env"}
_SHELLS = {"bash", "sh", "zsh", "dash"}
_ARRAY_ASSIGN = re.compile(r"^(?:export\s+|local\s+|declare\s+(?:-\w+\s+)*)?[A-Za-z_]\w*=\(")
_FUNC_DEF = re.compile(r"^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)\s*\{?|^function\s+([A-Za-z_][\w-]*)\s*\{?")
_SUBST_PROG = re.compile(r"\$\(\s*([^\s()|;&<>]+)|`\s*([^\s`|;&<>]+)[^`]*`")
_SQ_TEXT = re.compile(r"'[^']*'")
_SRC_ASSIGN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_]\w*)=(\"[^\"]*\"|'[^']*'|[^\s;#]*)\s*(?:#.*)?$")


def _unshape(text: str, quoted: List[str]) -> str:
    """Put quoted placeholders back with their quote characters (inverse of _strip_data for one fragment)."""
    return re.sub(r"([\"'])Q(\d+)\1", lambda m: m.group(1) + quoted[int(m.group(2))] + m.group(1), text)


def _subst_vars(text: str, env: Dict[str, str], missing: Optional[str]) -> str:
    """``$V`` / ``${V}`` / ``${V:-default}`` / ``${V-default}`` from *env*; an unset name without default → *missing*."""
    def _one(m: "re.Match[str]") -> str:
        name = m.group(1) or m.group(4)
        if name in env:
            return env[name]
        return m.group(3) if m.group(2) else (m.group(0) if missing is None else missing)
    return re.sub(r"\$\{(\w+)(:?-([^}]*))?\}|\$(\w+)", _one, text)


def _assign_value_end(text: str) -> int:
    """For a segment starting ``VAR=$(…)`` / ``VAR="$(…)"`` / ``VAR=`…```: index just past the value, or -1 when the
    closing paren is not in this segment (the command line split inside the substitution)."""
    m = re.match(r"(?:export\s+|local\s+)?[A-Za-z_]\w*=(\"?)(\$\(|`)", text)
    if not m:
        return -1
    i, depth = m.end(), 1
    if m.group(2) == "`":
        j = text.find("`", i)
        return -1 if j < 0 else j + 1 + (1 if m.group(1) and text[j + 1:j + 2] == "\"" else 0)
    while i < len(text):
        if text.startswith("$(", i):
            depth += 1; i += 2
            continue
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1 + (1 if m.group(1) and text[i + 1:i + 2] == "\"" else 0)
        i += 1
    return -1


def _ordered_tokens(shape: str, quoted: List[str]) -> List[str]:
    """Shape tokens in order with quoted placeholders restored (``"Q2"`` → its text). ``--opt=value`` keeps the
    value, a leading ``@`` (curl body file) and ``<``/``>`` redirect glyphs are dropped."""
    out: List[str] = []
    for tok in shape.split():
        tok = tok.lstrip("<>0123456789&") if re.match(r"^\d?[<>]", tok) else tok
        if tok.startswith("-") and "=" in tok:
            tok = tok.split("=", 1)[1]
        tok = tok.lstrip("@")
        tok = _QTOK.sub(lambda m: quoted[int(m.group(2))], tok)
        if tok:
            out.append(tok.replace("\\", "/"))
    return out


# Secret files referenced inside program text; `process.env` / `os.environ` are not files and do not match.
_SECRET_IN_CODE = re.compile(r"(?<![\w.$])\.env(?![\w-])(?!\.(example|sample|template)\b)|\bauth\.json\b|\.git-credentials\b|"
                             r"\bcredentials?\.json\b|\bid_(rsa|ed25519|ecdsa)\b")
# Windows 8.3 short names of secret files (.env → ENV~1, auth.json → AUTH~1.JSO, credentials.json → CREDEN~1.JSO …)
_SHORT_SECRET_NAME = re.compile(r"^(env|auth|creden|gitcre|git-cr|id_rsa|id_ed2|id_ecd)\w{0,2}~\d+(\.\w{0,3})?$", re.I)
_CRED_JSON_KEY = re.compile(rb'"(access_?token|refresh_?token|id_token|api_?key|private_key|client_secret|oauth_token)"\s*:\s*"[^"\s]{16,}"', re.I)


def _json_holds_credentials(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size <= 2 * 1024 * 1024 and bool(_CRED_JSON_KEY.search(path.read_bytes()))
    except OSError:
        return True  # cannot tell: stay on the safe side


_CONTENT_SCAN_MAX = 2 * 1024 * 1024   # bytes; larger files are not scanned for secret values
_GLOB_MAX = 200                         # glob matches checked by name per argument
_GLOB_CONTENT_MAX = 20                  # glob matches also scanned for secret values (more → names only)
_PY_OPEN_WRITE = re.compile(r"open\([^)]*,\s*(mode\s*=\s*)?['\"][wax]|\.write_text\(|\.write_bytes\(|\.unlink\(|rmtree\(")
_DB_FILE = re.compile(r"\.(sqlite3?|db)(-wal|-shm|-journal)?$", re.I)


# ---- W4-X1 / W6-X2 (2026-10-07 follow-up): protect secret files by IDENTITY and keep reads inside known roots ----
# A name rule loses to any second name for the same bytes (hard link, junction, 8.3 alias, subst drive, UNC, MSYS or
# WSL spelling). Files are therefore also matched by (volume, file index) from os.stat, which every alias shares.
# Limits, stated plainly: program text that assembles a path at run time (python -c, node -e, execute_code) and
# tools the guard does not parse can still reach any file this Windows account can read. Only running bots under a
# separate OS account closes that (PLAN 7.4 U-F2); this index narrows the reachable surface, it is not a boundary.
_INDEX_TTL = 300.0                      # seconds before the protected-file index is rebuilt
_WALK_SKIP = {"node_modules", ".git", ".next", "venv", ".venv", "__pycache__", "dist", "build", ".cache"}
_READ_VERB = re.compile(r"^(cat|type|head|tail|less|more|gc|get-content|findstr|grep|egrep|fgrep|zgrep|rg|sed|awk|cp|copy|"
                        r"xcopy|robocopy|base64|certutil|xxd|od|hexdump|strings|select-string|sls|nl|tac|sort|uniq|cut|"
                        r"diff|cmp|fc|comp|tar|zip|7z|compress-archive|iconv|openssl|gpg|ln|mklink|fsutil|new-item|"
                        r"copy-item|cpi|move-item|rename-item|ren|mv|move|import-csv|get-filehash|certreq)(\.exe)?$", re.I)
_RECURSIVE_SEARCH = re.compile(r"^(grep|egrep|fgrep|zgrep)(\.exe)?\b.*\s-\w*[rR]|^rg(\.exe)?\b|^findstr(\.exe)?\b.*\s/[sS]\b|"
                               r"^(select-string|sls)\b|^(get-childitem|gci|dir|ls)\b.*-(recurse|r)\b.*\|\s*(select-string|sls)\b",
                               re.I)
_RG_SEES_HIDDEN = re.compile(r"\s(--hidden|-\w*u|--no-ignore\S*|-\w*\.)\b")


def _norm_key(p: "str | Path") -> str:
    """Case-folded forward-slash form of a resolved path, for prefix comparisons."""
    return str(p).replace("\\", "/").rstrip("/").lower()


def _win_path(raw: str) -> str:
    raw = raw.replace("\\", "/")
    if re.match(r"^/mnt/[a-zA-Z]/", raw):
        return raw[5].upper() + ":" + raw[6:]
    if re.match(r"^/[a-zA-Z]/", raw):
        return raw[1].upper() + ":" + raw[2:]
    if re.match(r"^//(wsl\$|wsl\.localhost)/", raw, re.I):
        return raw
    return raw


def _real(p: "str | Path") -> Optional[str]:
    try:
        return os.path.realpath(_win_path(str(p)))
    except (OSError, ValueError):
        return None


def _file_ident(p: "str | Path") -> "Optional[tuple[int, int]]":
    try:
        st = os.stat(_win_path(str(p)))
    except (OSError, ValueError):
        return None
    if not (st.st_mode & 0o170000) == 0o100000 or not st.st_ino:  # regular files with a real file index only
        return None
    return (st.st_dev, st.st_ino)


class SecretIndex:
    """Protected files by identity + path, rebuilt every few minutes. Placeholders in rule globs:
    {hermes} root Hermes home, {userhome} the account's home, {workspaces} the shared work root."""

    def __init__(self, globs: List[str], scan_roots: List[str], name_check, places: Dict[str, str]):
        self._globs, self._scan_roots, self._name_check, self._places = globs, scan_roots, name_check, places
        self._built = 0.0
        self._idents: Dict["tuple[int, int]", str] = {}
        self._keys: List[str] = []
        self._lock = threading.Lock()

    def _fill(self, s: str) -> str:
        for k, v in self._places.items():
            s = s.replace("{" + k + "}", v)
        return s

    def _add(self, path: str, idents: Dict["tuple[int, int]", str], keys: List[str]) -> None:
        ident = _file_ident(path)
        real = _real(path)
        if ident is None or real is None:
            return
        idents[ident] = real
        keys.append(_norm_key(real))

    def _build(self) -> None:
        import glob as _glob
        idents: Dict["tuple[int, int]", str] = {}
        keys: List[str] = []
        for g in self._globs:
            pat = self._fill(g)
            if "{" in pat:
                continue
            try:
                for x in _glob.glob(pat, recursive=True, include_hidden=True)[:5000]:
                    self._add(x, idents, keys)
            except (OSError, ValueError, TypeError):
                continue
        for root in self._scan_roots:  # bounded walk for secret-named files inside shared work folders
            base = self._fill(root)
            if "{" in base or not os.path.isdir(base):
                continue
            base_depth = base.rstrip("/\\").count(os.sep) + base.rstrip("/\\").count("/")
            for dirpath, dirnames, filenames in os.walk(base):
                depth = dirpath.count(os.sep) + dirpath.count("/") - base_depth
                dirnames[:] = [] if depth >= 4 else [d for d in dirnames if d not in _WALK_SKIP]
                for f in filenames:
                    if self._name_check(f):
                        full = os.path.join(dirpath, f)
                        # an i18n `locales/ko/auth.json` is not a credential store (same rule as the glob check)
                        if f.lower().endswith(".json") and not _json_holds_credentials(Path(full)):
                            continue
                        self._add(full, idents, keys)
        self._idents, self._keys, self._built = idents, keys, time.monotonic()

    def _fresh(self) -> None:
        if time.monotonic() - self._built > _INDEX_TTL or not self._built:
            with self._lock:
                if time.monotonic() - self._built > _INDEX_TTL or not self._built:
                    self._build()

    def hit(self, p: "str | Path") -> bool:
        """True when *p* names a protected file under any alias."""
        self._fresh()
        ident = _file_ident(p)
        return ident is not None and ident in self._idents

    def inside(self, root: "str | Path", visible_only: bool = False) -> Optional[str]:
        """A protected file below *root* (a content search there would read it), else None. visible_only skips
        dot-named files, which ripgrep-style searches leave out unless asked."""
        self._fresh()
        real = _real(root)
        if real is None:
            return None
        k = _norm_key(real) + "/"
        for key in self._keys:
            if key.startswith(k) and not (visible_only and any(part.startswith(".") for part in key[len(k):].split("/"))):
                return key
        return None


_INDEX_CACHE: Dict[tuple, SecretIndex] = {}
_INDEX_CACHE_LOCK = threading.Lock()


def _shared_index(globs: List[str], scan_roots: List[str], name_check, places: Dict[str, str], key_extra: tuple) -> SecretIndex:
    """One index per distinct rule set + placeholders: a multiplexed gateway registers this guard once per profile, and
    every profile shares the same protected files, so they share one walk."""
    key = (tuple(globs), tuple(scan_roots), tuple(sorted(places.items())), key_extra)
    with _INDEX_CACHE_LOCK:
        idx = _INDEX_CACHE.get(key)
        if idx is None:
            idx = _INDEX_CACHE[key] = SecretIndex(globs, scan_roots, name_check, places)
        return idx


def _issue_payloads_legacy(seg: str, shape: str, quoted: List[str]) -> List[str]:
    """Raw JSON texts from an inline body (-d/--data*), a heredoc body, or an @file body in a curl to /issues."""
    url_hit = any(_ISSUE_URL_LEGACY.search(q + " ") for q in quoted) or _ISSUE_URL_LEGACY.search(shape)
    if not url_hit:
        return []
    texts: List[str] = list(quoted)
    if m := _HEREDOC_BODY.search(seg):
        texts.append(m.group(3))
    for fm in re.finditer(r"@([^\s\"']+)", shape):
        p = fm.group(1)
        if p.startswith("Q") and p[1:].isdigit():
            p = quoted[int(p[1:])]
        if p != "-":
            try:
                texts.append(Path(p.replace("\\", "/")).read_text(encoding="utf-8"))
            except OSError:
                pass
    return texts


def _expand_path(p: str, cwd: Optional[str], env: Optional[Dict[str, str]] = None) -> Optional[Path]:
    """Resolve a curl @file / command argument path the way the shell would: env vars, ~, and a preceding `cd`.
    None when the path depends on something the gate cannot see (command substitution, unknown variable)."""
    p = p.replace("\\", "/")
    if re.search(r"\$\(|`", p):
        return None
    env = env or {}

    def _var(m: "re.Match[str]") -> str:
        name = m.group(1) or m.group(2)
        return env.get(name) or os.environ.get(name) or m.group(0)

    p = re.sub(r"\$\{(\w+)[^}]*\}|\$(\w+)", _var, p)
    if "$" in p:
        return None
    p = os.path.expanduser(p)
    if re.match(r"^/mnt/[a-zA-Z]/", p):  # WSL /mnt/c/Users → C:/Users
        p = p[5].upper() + ":" + p[6:]
    elif re.match(r"^/[a-zA-Z]/", p):  # MSYS /c/Users → C:/Users
        p = p[1].upper() + ":" + p[2:]
    path = Path(p)
    if not path.is_absolute():
        if not cwd:
            return None
        path = Path(cwd) / path
    return path


def _body_args(shape: str, quoted: List[str]) -> List["tuple[str, str]"]:
    """(kind, value) for each curl body argument: kind is 'single' | 'double' | 'bare'."""
    out = []
    for m in _BODY_FLAG.finditer(shape):
        tok = m.group(1)
        prefix = "@" if tok.startswith("@") else ""
        rest = tok[1:] if prefix else tok
        if q := _QTOK.match(rest):
            kind, val = ("single" if q.group(1) == "'" else "double"), quoted[int(q.group(2))]
        else:
            kind, val = "bare", rest
        out.append((kind, prefix + val))
    return out


def _issue_payloads_strict(seg: str, shape: str, quoted: List[str], cwd: Optional[str] = None,
                           env: Optional[Dict[str, str]] = None) -> "tuple[List[str], Optional[str]]":
    """Strict variant: JSON texts from every body argument of a curl to /issues, plus the first body argument
    the gate could NOT read (shell variable, command substitution, @- without heredoc, @file that does not exist
    yet) — None when every body was readable."""
    url_hit = any(_ISSUE_URL.search(q + " ") for q in quoted) or _ISSUE_URL.search(shape)
    if not url_hit:
        return [], None
    texts: List[str] = []
    opaque: Optional[str] = None
    heredoc = _HEREDOC_BODY.search(seg)
    if heredoc:
        texts.append(heredoc.group(3))
    for kind, val in _body_args(shape, quoted):
        if val.startswith("@"):
            p = val[1:]
            if p == "-":
                if not heredoc:
                    opaque = opaque or val
                continue
            path = None if (kind == "single" and "$" in p) else _expand_path(p, cwd, env)
            try:
                if path is None:
                    raise OSError
                texts.append(path.read_text(encoding="utf-8"))
            except OSError:
                opaque = opaque or val
        elif kind == "single":
            texts.append(val)
        elif "$" in val or "`" in val:
            opaque = opaque or val  # "$B", $B, "$(cat x)" — the shell fills it in after the gate looked
        else:
            texts.append(val)
    return texts, opaque


class Guard:
    """Pure rule evaluator — no Hermes imports, so it is unit-testable and reusable."""

    def __init__(self, rules: Dict[str, Any], role: str, mode: str, log_path: Optional[Path] = None,
                 home: Optional[Path] = None):
        if role not in _VALID_ROLES:
            raise ValueError(f"agentos-guard: unknown role {role!r} (valid: {', '.join(_VALID_ROLES)})")
        if mode not in _VALID_MODES:
            raise ValueError(f"agentos-guard: unknown mode {mode!r} (valid: {', '.join(_VALID_MODES)})")
        self.role, self.mode, self.log_path = role, mode, log_path
        r = (rules.get("roles") or {}).get(role) or {}
        self.title_rules = TitleRules(rules.get("issue_title") or {}) if r.get("check_issue_title") else None
        self.comment_rules = (CommentRules(rules.get("issue_comment") or {}, bool(r.get("check_done_comment")), bool(r.get("check_reject_comment")))
                              if r.get("check_done_comment") or r.get("check_reject_comment") else None)
        self.strict_issue = bool(r.get("strict_issue_calls"))
        pr = r.get("protect") or {}
        self.protect_write = [str(p) for p in (pr.get("write_paths") or [])]
        self.protect_read = [re.compile(str(p), re.I) for p in (pr.get("read_basenames") or [])]
        self.protect_other_profiles = bool(pr.get("other_profiles"))
        self.skills_own_only = bool(pr.get("skills_own_only"))
        self.home = Path(home) if home else None
        self.own_profile = self.home.name.lower() if self.home and self.home.parent.name.lower() == "profiles" else None
        # W4-X1/W6-X2: identity index of protected files + the roots read tools may open (see SecretIndex)
        self._places: Dict[str, str] = {}
        if self.home:
            import tempfile
            hermes_root = self.home.parent.parent if self.own_profile else self.home
            userhome = Path.home()
            self._places = {"hermes": str(hermes_root).replace("\\", "/"), "own": str(self.home).replace("\\", "/"),
                            "userhome": str(userhome).replace("\\", "/"),
                            "workspaces": str(userhome / "orca" / "workspaces").replace("\\", "/"),
                            "temp": tempfile.gettempdir().replace("\\", "/")}
        self.secret_index: Optional[SecretIndex] = None
        if self._places and (pr.get("secret_paths") or pr.get("secret_scan_roots")):
            self.secret_index = _shared_index([str(x) for x in pr.get("secret_paths") or []],
                                              [str(x) for x in pr.get("secret_scan_roots") or []],
                                              self._secret_name, self._places,
                                              tuple(p.pattern for p in self.protect_read))
        self.read_roots: List[str] = []
        for r_ in pr.get("read_roots") or []:
            filled = str(r_)
            for k_, v_ in self._places.items():
                filled = filled.replace("{" + k_ + "}", v_)
            if "{" not in filled and (real_ := _real(filled)):
                self.read_roots.append(_norm_key(real_))
        # Variables a worker's terminal sees that the gateway process may not (Hermes points TMPDIR at the
        # profile's own scratch dir), so `cd "$TMPDIR/x" && curl -d @done.json` resolves to the right file.
        self._env: Dict[str, str] = {}
        if self.home:
            scratch = str(self.home / "cache" / "scratch").replace("\\", "/")
            self._env = {"TMPDIR": scratch, "TMP": scratch, "TEMP": scratch, "HERMES_HOME": str(self.home).replace("\\", "/")}
        # Literal secret values from this bot's own .env (held in memory only, never logged). Any tool call that
        # carries one — a comment, a document, a file, a command — is refused: the bot saw the value somewhere
        # (env dump, error text) and is about to write it out.
        self._cwd_cache: "tuple[Optional[float], Optional[str]]" = (None, None)
        self._secret_values: List[str] = []
        if pr.get("secret_values") and self.home:
            try:
                for line in (self.home / ".env").read_text(encoding="utf-8").splitlines():
                    k, _, v = line.partition("=")
                    v = v.strip().strip("\"'")
                    if re.search(r"KEY|TOKEN|SECRET|PASSWORD|PASS\b", k, re.I) and len(v) >= 12:
                        self._secret_values.append(v)
            except OSError:
                pass
        self.deny_tools = set(((r.get("tools") or {}).get("deny")) or [])
        self.deny_skill_actions = set(((r.get("skill_manage") or {}).get("deny_actions")) or [])
        w = r.get("write") or {}
        self.allow_paths = [str(p) for p in (w.get("allow_paths") or [])]
        self.any_ext_paths = [str(p) for p in (w.get("any_ext_paths") or [])]
        self.deny_ext = {str(e).lower() for e in (w.get("deny_ext") or [])}
        t = r.get("terminal") or {}
        self.term_allow = [re.compile(p) for p in (t.get("allow") or [])]
        # W6-X1: deny patterns ignore case (Windows resolves SSH.exe like ssh.exe) and are also tried on the
        # un-quoted program name, so `"ssh" host` cannot slip past as a quoted placeholder.
        self.term_deny = [re.compile(p, re.I) for p in (t.get("deny") or [])]
        # deny_raw: matched on the raw segment INCLUDING quoted text, so `bash -c "ssh nas"` / `wsl -- docker ps` are
        # caught even where the shell-escape check is off (basic role). Costs false hits on quoted mentions.
        self.term_deny_raw = [re.compile(p, re.I) for p in (t.get("deny_raw") or [])]
        self.shell_escape_guard = bool(t.get("shell_escape_guard", True))
        self.inline_python_guard = bool(t.get("inline_python_guard", False))
        self.redirect_guard = bool(t.get("redirect_guard", False))
        self.allow_programs = {str(p).lower() for p in (t.get("allow_programs") or [])}
        self.max_calls = int(((r.get("budget") or {}).get("max_tool_calls")) or 0)
        self._counts: Dict[str, int] = {}
        self._lock = threading.Lock()

    # ---- individual checks: return a reason string when the call violates the role, else None ----

    def _check_budget(self, session_id: str) -> Optional[str]:
        if self.max_calls <= 0:
            return None
        with self._lock:
            n = self._counts.get(session_id, 0) + 1
            self._counts[session_id] = n
        if n > self.max_calls:
            return (f"툴 호출 예산 초과({n}/{self.max_calls}회, 세션 {session_id or '-'}). 더 이상 도구를 쓰지 말고 "
                    f"현재 상태·한 일·남은 일을 댓글로 남긴 뒤 blocked 처리하거나 사장님 판단을 요청하세요.")
        return None

    def _check_tool(self, tool_name: str) -> Optional[str]:
        if tool_name in self.deny_tools:
            return f"{self.role} 역할은 '{tool_name}' 도구를 쓸 수 없습니다."
        return None

    def _check_skill_manage(self, args: Dict[str, Any]) -> Optional[str]:
        ops = args.get("operations")
        actions = {str(o.get("action")) for o in ops if isinstance(o, dict)} if isinstance(ops, list) else set()
        if action := args.get("action"):
            actions.add(str(action))
        bad = sorted(actions & self.deny_skill_actions)
        if bad:
            return f"{self.role} 역할은 스킬을 수정할 수 없습니다(action: {', '.join(bad)})."
        return None

    def _check_write(self, tool_name: str, args: Dict[str, Any]) -> Optional[str]:
        key = _WRITE_TOOLS[tool_name]
        path = args.get(key)
        if not isinstance(path, str) or not path:
            return None
        norm = path.replace("\\", "/")
        if self.any_ext_paths and _path_matches(norm, self.any_ext_paths):
            return None  # scratch / evidence folders: any file type
        ext = os.path.splitext(norm)[1].lower()
        if ext and ext in self.deny_ext:
            return f"{self.role} 역할은 '{ext}' 파일을 쓸 수 없습니다: {path}"
        if self.allow_paths and not _path_matches(norm, self.allow_paths):
            return f"{self.role} 역할의 쓰기 허용 경로 밖입니다: {path} (허용: {', '.join(self.allow_paths)})"
        return None

    def _check_terminal(self, args: Dict[str, Any]) -> Optional[str]:
        cmd = args.get("command")
        if not isinstance(cmd, str) or not cmd.strip():
            return None
        if self.strict_issue or self.protect_write or self.protect_read or self.protect_other_profiles:
            if reason := self._check_terminal_strict(cmd, args.get("workdir")):
                return reason
        cwd: Optional[str] = args.get("workdir") if isinstance(args.get("workdir"), str) else None
        env: Dict[str, str] = {}
        for seg in _split_command_line(cmd):
            shape, quoted = _strip_data(seg)
            head = shape.lstrip()
            if m := _CD_SEG.match(head):  # track cd / VAR= so a program's relative write path can be resolved
                p = _expand_path(quoted[int(m.group(1))] if m.group(1) is not None else m.group(2), cwd, env)
                cwd = str(p) if p else None
            elif m := _ASSIGN_SEG.match(head):
                val = quoted[int(m.group(2))] if m.group(2) is not None else (m.group(3) or "")
                if "$(" in val or "`" in val:
                    env.pop(m.group(1), None)
                else:
                    env[m.group(1)] = re.sub(r"\$\{(\w+)[^}]*\}|\$(\w+)",
                                             lambda v: env.get(v.group(1) or v.group(2)) or os.environ.get(v.group(1) or v.group(2)) or v.group(0), val)
            shape = _run_shape(shape)
            if (self.title_rules or self.comment_rules) and not self.strict_issue and _ISSUE_CALL_LEGACY.search(shape):
                for text in _issue_payloads_legacy(seg, shape, quoted):
                    if self.title_rules:
                        for title in _issue_titles_from_json(text):
                            if reason := self.title_rules.check(title):
                                return reason
                    if self.comment_rules and (body := _issue_body_from_json(text)):
                        if reason := self.comment_rules.check_body(body):
                            return reason
            for pat in self.term_deny_raw:
                if m := pat.search(seg):
                    return f"{self.role} 역할에 금지된 명령입니다: '{m.group(0).strip()}' in `{seg[:120]}`"
            if self.shell_escape_guard and _SHELL_ESCAPE.search(shape):
                return f"{self.role} 역할은 셸 인터프리터에 명령 문자열을 넘길 수 없습니다: `{seg[:120]}`"
            if self.redirect_guard:
                for m in _REDIRECT.finditer(shape):
                    target = quoted[int(m.group(1))] if m.group(1) is not None else m.group(2)
                    if target not in ("/dev/null", "NUL", "nul") and not _REDIRECT_OK.search(target):
                        return f"{self.role} 역할은 파일로 출력을 저장할 수 없습니다(scratch/evidence 폴더만 가능): `{target}`"
            for pat in self.term_deny:
                m = pat.search(shape) or pat.search(_resolve_head(shape, quoted))
                if m:
                    return f"{self.role} 역할에 금지된 명령입니다: '{m.group(0).strip()}' in `{seg[:120]}`"
            if self.comment_rules and not self.inline_python_guard:
                for pat, idx in ((_PY_INLINE, 1), (_JS_INLINE, 2)):
                    if (m := pat.match(shape)) and _hidden_transition(quoted[int(m.group(idx))], self.strict_issue):
                        return "인라인 프로그램 안에서 작업 상태를 바꿀 수 없습니다 — curl -d '<JSON>' 처럼 본문이 보이는 형태로 보내세요."
            if self.inline_python_guard:
                inline = _inline_program(seg, shape, quoted)
                if inline is not None:
                    code, danger, label = inline
                    if hit := (_py_danger(code, cwd, env) if danger is _PY_DANGER else (d.group(0) if (d := danger.search(code)) else None)):
                        return f"{self.role} 역할의 {label} 안에 금지 동작이 있습니다: '{hit}'"
                    if self.comment_rules and _hidden_transition(code):
                        return f"{label} 안에서 작업 상태를 바꿀 수 없습니다 — curl -d '<JSON>' 처럼 본문이 보이는 형태로 보내세요."
                    continue  # inline program passed its own check; skip the allow list
            if self.term_allow and not any(p.search(shape) or p.search(_resolve_head(shape, quoted)) for p in self.term_allow):
                return f"{self.role} 역할의 허용 명령 목록에 없습니다: `{seg[:120]}`"
        if self.allow_programs:
            wd = args.get("workdir") if isinstance(args.get("workdir"), str) and args.get("workdir") else self._default_cwd()
            return self._check_programs(cmd, wd, dict(self._env), set())
        return None

    # ---- W6-X1: program allow list ----

    def _prog_of(self, tok: str, quoted: List[str], env: Dict[str, str]) -> "tuple[str, bool]":
        """``(name, known)``: the plain program name a shell would run for *tok* — quoted pieces joined, variables
        resolved, folder and .exe/.cmd dropped, lower case. ``known`` is False when part of it is only decided at
        run time (an unset variable, a command substitution)."""
        t = re.sub(r"[\"']Q(\d+)[\"']", lambda m: quoted[int(m.group(1))], tok)
        if "$(" in t or "`" in t:
            return t, False
        t = _subst_vars(t, env, "\x00")
        name = re.split(r"[/\\]", t.replace("\"", "").replace("'", ""))[-1].lower()
        if "\x00" in name or "$" in name:
            return tok, False
        return re.sub(r"\.(exe|cmd|bat|com)$", "", name), True

    def _source_defs(self, raw: str, cwd: Optional[str], env: Dict[str, str], funcs: set) -> None:
        """`. file` / `source file`: the shell functions and plain variables that file defines become known."""
        p = _expand_path(raw, cwd, env)
        try:
            if p is None or not p.is_file() or p.stat().st_size > 256 * 1024:
                return
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return
        for line in lines:
            if fm := _FUNC_DEF.match(line.strip()):
                funcs.add((fm.group(1) or fm.group(2)).lower())
            elif am := _SRC_ASSIGN.match(line):
                env[am.group(1)] = am.group(2).strip("\"'")

    def _check_programs(self, cmd: str, cwd: Optional[str], env: Dict[str, str], funcs: set,
                        depth: int = 0) -> Optional[str]:
        """Reason when *cmd* would start a program outside ``allow_programs``, else None."""
        if depth > 4:
            return f"{self.role} 역할: 명령이 너무 깊게 겹쳐 있어 guard가 확인할 수 없습니다 — 나눠서 실행하세요."
        unknown = (lambda tok: f"{self.role} 역할: 실행할 프로그램이 변수·명령 결과로 정해져 guard가 확인할 수 없습니다: "
                               f"`{tok[:60]}` — 프로그램 이름을 직접 쓰세요.")
        for seg in _split_command_line(cmd):
            shape, quoted = _strip_data(seg)
            # $(…) and `…` start programs too; double-quoted text still expands them, single-quoted text does not
            dq = re.sub(r"\"Q(\d+)\"", lambda m: "\"" + quoted[int(m.group(1))] + "\"", shape)
            for m in re.finditer(r"\$\(([^()]*)\)|`([^`]*)`", dq):
                inner = m.group(1) if m.group(1) is not None else m.group(2)
                if inner.strip() and (r := self._check_programs(inner, cwd, env, funcs, depth + 1)):
                    return r
            for m in _SUBST_PROG.finditer(dq):  # openings whose closing paren landed in another segment
                name, known = self._prog_of(m.group(1) or m.group(2), [], env)
                if not known:
                    return unknown(m.group(0))
                if name and name not in self.allow_programs and name not in funcs and name not in _SHELL_SKIP:
                    return self._not_allowed(name)
            head = re.sub(r"^(?:(?:do|then|else|elif|if|while|until|!|\{|time)\s+)+", "", shape.strip())
            if not head or head.startswith("#"):
                continue
            if am := re.match(r"(?:export\s+|local\s+)?([A-Za-z_]\w*)=\"?(\$\(|`)", head):
                env.pop(am.group(1), None)
                end = _assign_value_end(head)
                rest = head[end:].strip() if end > 0 else ""   # -1: the line was split inside the substitution
                if rest and (r := self._check_programs(_unshape(rest, quoted), cwd, env, funcs, depth + 1)):
                    return r
                continue
            if m := _CD_SEG.match(head):
                p = _expand_path(quoted[int(m.group(1))] if m.group(1) is not None else m.group(2), cwd, env)
                cwd = str(p) if p else cwd
                continue
            if m := _ASSIGN_SEG.match(head):
                val = quoted[int(m.group(2))] if m.group(2) is not None else (m.group(3) or "")
                if "$(" in val or "`" in val:
                    env.pop(m.group(1), None)
                else:
                    env[m.group(1)] = _subst_vars(val, env, None)
                continue
            if _ARRAY_ASSIGN.match(head):
                continue
            if fm := _FUNC_DEF.match(head):
                funcs.add((fm.group(1) or fm.group(2)).lower())
                rest = head[fm.end():].strip()
                if rest and (r := self._check_programs(_unshape(rest, quoted), cwd, env, funcs, depth + 1)):
                    return r
                continue
            toks = [t[:len(t) - (t.count(")") - t.count("("))] if t.endswith(")") and t.count(")") > t.count("(") else t
                    for t in _run_shape(head).split()]   # `(a || b)`: the subshell's closing paren is not a name
            i, name = 0, ""
            while i < len(toks):
                while i < len(toks) and toks[i] in _SHELL_WORDS:
                    i += 1
                if i >= len(toks) or toks[i] in _SHELL_SKIP or toks[i] in ("[[", "(("):
                    name = ""
                    break
                tok = toks[i].lstrip("(")
                name, known = self._prog_of(tok, quoted, env)
                if not known:
                    return unknown(_unshape(tok, quoted))
                if name in _WRAPPERS:
                    if name == "command" and i + 1 < len(toks) and toks[i + 1] in ("-v", "-V"):
                        name = ""
                        break  # lookup only, starts nothing
                    j = i + 1
                    while j < len(toks) and (toks[j].startswith("-") or re.match(r"^[A-Za-z_]\w*=", toks[j])):
                        j += 1
                    if j < len(toks):
                        i = j
                        continue
                break
            if not name:
                continue
            args = toks[i + 1:]
            if name in funcs:  # shell function from this command line or a sourced file; `fn … -- prog …` runs prog
                if "--" in args and (rest := args[args.index("--") + 1:]):
                    if r := self._check_programs(_unshape(" ".join(rest), quoted), cwd, env, funcs, depth + 1):
                        return r
                continue
            if name not in self.allow_programs:
                return self._not_allowed(name)
            if name in (".", "source") and args:
                self._source_defs(_unshape(args[0], quoted).strip("\"'"), cwd, env, funcs)
            elif name in _SHELLS:
                k = next((n for n, a in enumerate(args) if re.fullmatch(r"-[A-Za-z]*c[A-Za-z]*", a)), None)
                if k is not None:
                    rest = args[k + 1:]
                    if rest:
                        mm = _QPLACE.match(rest[0])
                        text = quoted[int(mm.group(1))] if mm else _unshape(" ".join(rest), quoted)
                        if r := self._check_programs(text, cwd, env, funcs, depth + 1):
                            return r
                elif (h := _HEREDOC_BODY.search(seg)) is not None:
                    if r := self._check_programs(h.group(3), cwd, env, funcs, depth + 1):
                        return r
                elif not [a for a in args if not a.startswith("-") and not a.startswith("<") and not re.match(r"^\d?[<>]", a)]:
                    return (f"{self.role} 역할: `{name}`가 받는 명령을 guard가 볼 수 없습니다(파이프·표준입력). "
                            f"스크립트 파일이나 명령을 직접 실행하세요.")
            elif name == "wsl":
                rest: List[str] = []
                n = 0
                while n < len(args):
                    a = args[n]
                    if a in ("-d", "--distribution", "-u", "--user", "--cd"):
                        n += 2
                        continue
                    if a in ("-e", "--exec", "--"):
                        rest = args[n + 1:]
                        break
                    if a.startswith("-"):
                        n += 1
                        continue
                    rest = args[n:]
                    break
                if rest and (r := self._check_programs(_unshape(" ".join(rest), quoted), cwd, env, funcs, depth + 1)):
                    return r
            elif name == "find":
                for n, a in enumerate(args):
                    if a in ("-exec", "-execdir", "-ok", "-okdir") and n + 1 < len(args):
                        sub, known = self._prog_of(args[n + 1], quoted, env)
                        if not known:
                            return unknown(_unshape(args[n + 1], quoted))
                        if sub not in self.allow_programs:
                            return self._not_allowed(sub)
        return None

    def _not_allowed(self, name: str) -> str:
        return (f"{self.role} 역할의 허용 프로그램 목록에 없는 명령입니다: `{name[:60]}` — 꼭 필요하면 담당 봇에게 넘기거나 "
                f"사장님께 목록 추가를 요청하세요.")

    # ---- worker hardening (strict_issue_calls / protect) ----

    def _protected_write(self, raw: str, cwd: Optional[str] = None, env: Optional[Dict[str, str]] = None) -> Optional[str]:
        """Reason when writing to *raw* would touch a protected file or another bot's profile, else None."""
        if not raw or raw.startswith("-"):
            return None
        p = _expand_path(raw, cwd, env)
        norm = (str(p) if p else raw).replace("\\", "/")
        low = norm.lower()
        if not low.startswith("/") and not re.match(r"^[a-z]:/", low):
            low = "/" + low.lstrip("./")  # relative path: still match '/hermes-plugins/agentos-guard/…'
        for pat in self.protect_write:
            if re.search(pat, low, re.I):
                return f"{self.role} 역할은 봇 설정·비밀·guard 파일을 바꿀 수 없습니다: {raw}"
        if self.protect_other_profiles and self.own_profile and (m := re.search(r"/hermes/profiles/([^/]+)", low)):
            if m.group(1) != self.own_profile:
                return f"{self.role} 역할은 다른 봇의 폴더에 쓸 수 없습니다: {raw}"
        return None

    def _secret_name(self, base: str) -> bool:
        return any(p.search(base) for p in self.protect_read) or bool(_SHORT_SECRET_NAME.search(base))

    def _default_cwd(self) -> Optional[str]:
        """The bot's terminal cwd from its profile config.yaml (re-read when the file changes), so a bare relative
        argument like `cat notes.txt` can still be resolved for the content check."""
        if not self.home:
            return None
        cfg = self.home / "config.yaml"
        try:
            mt = cfg.stat().st_mtime
        except OSError:
            return None
        if self._cwd_cache[0] != mt:
            cwd = None
            try:
                import yaml
                data = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
                v = ((data.get("terminal") or {}).get("cwd")) if isinstance(data, dict) else None
                cwd = str(v) if v and str(v) not in (".", "") else None
            except Exception:  # never let config parsing break the agent loop
                cwd = None
            self._cwd_cache = (mt, cwd)
        return self._cwd_cache[1]

    def _holds_secret(self, path: Path) -> bool:
        """True when *path* is a small regular file that contains one of this bot's literal secret values
        (catches a renamed/copied secret file whatever its name)."""
        if not self._secret_values:
            return False
        try:
            if not path.is_file() or path.stat().st_size > _CONTENT_SCAN_MAX:
                return False
            data = path.read_bytes()
        except OSError:
            return False
        return any(v.encode("utf-8") in data for v in self._secret_values)

    def _protected_read(self, raw: str, cwd: Optional[str] = None, env: Optional[Dict[str, str]] = None) -> Optional[str]:
        msg = f"{self.role} 역할은 비밀 파일(키·인증 정보)을 열 수 없습니다: {raw} — 필요한 값이 있으면 사장님께 요청하세요."
        base = raw.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
        if self._secret_name(base):
            return msg
        if not raw or raw.startswith("-") or len(raw) > 400 or re.match(r"^[a-z][\w+.-]*://", raw, re.I):
            return None
        p = _expand_path(raw, cwd or self._default_cwd(), env if env is not None else self._env)
        if p is None:
            return None
        cands: List[Path] = []
        globbed = bool(re.search(r"[*?\[]", base) or re.search(r"[*?]", str(p)))
        if globbed:
            try:
                import glob as _glob
                cands = [Path(x) for x in _glob.glob(str(p), recursive=False, include_hidden=True)[:_GLOB_MAX]]
            except (TypeError, ValueError, OSError):
                cands = []
        else:
            cands = [p]
        scan = len(cands) <= _GLOB_CONTENT_MAX  # wide globs: names only, so one `cat *.md` cannot stall the gateway
        for c in cands:
            if self.secret_index is not None and self.secret_index.hit(c):
                return msg  # same file under another name (hard link, junction, 8.3, subst, UNC, MSYS/WSL spelling)
            names = [c.name]
            try:
                if c.is_symlink():
                    names.append(Path(os.path.realpath(c)).name)
            except OSError:
                pass
            if any(self._secret_name(n) for n in names):
                # a glob that sweeps up e.g. an i18n `locales/ko/auth.json` is not a credential store: for globbed
                # .json matches require credential-looking keys before refusing
                if not (globbed and c.suffix.lower() == ".json" and not _json_holds_credentials(c)):
                    return msg
            if scan and self._holds_secret(c):
                return (f"{self.role} 역할은 비밀 값이 들어 있는 파일을 열 수 없습니다: {raw} — "
                        f"이름을 바꾼 비밀 파일로 보입니다. 필요한 값이 있으면 사장님께 요청하세요.")
        return None

    def _read_scope(self, tool_name: str, raw: str, args: Dict[str, Any]) -> Optional[str]:
        """Read tools stay inside the configured roots, and a content search may not sweep a folder that holds a
        protected file (the search would print its lines)."""
        if not raw or raw.startswith("-") or re.match(r"^[a-z][\w+.-]*://", raw, re.I):
            return None
        p = _expand_path(raw, self._default_cwd(), self._env)
        if p is None:
            return (f"{self.role} 역할: 읽을 경로가 실행 중에 정해져 guard가 확인할 수 없습니다: {raw[:80]} — "
                    f"경로를 직접 쓰세요.") if re.search(r"\$|`", raw) else None
        if not p.is_absolute():
            return None  # relative to an unknown process cwd: the name/identity checks above still ran
        real = _real(p)
        if real is None:
            return None
        key = _norm_key(real)
        if self.read_roots and not any(key == r or key.startswith(r + "/") for r in self.read_roots):
            return (f"{self.role} 역할은 이 위치를 읽을 수 없습니다: {raw[:100]} — 자기 프로필·작업 폴더·공용 스킬·"
                    f"Hermes 소스·임시 폴더만 읽을 수 있습니다. 필요하면 사장님께 요청하세요.")
        if tool_name == "search_files" and str(args.get("target") or "content") != "files" and self.secret_index is not None:
            if self.secret_index.inside(real):
                return (f"{self.role} 역할: 이 폴더 전체 검색에는 비밀 파일이 들어 있습니다: {raw[:100]} — "
                        f"검색 범위를 하위 폴더로 좁히세요.")
        return None

    def _terminal_read_checks(self, head: str, tokens: List[str], cwd: Optional[str], env: Dict[str, str]) -> Optional[str]:
        """Read/copy/link verbs in a terminal segment: refuse file names the guard cannot see (built at run time) and
        recursive content searches over a folder that holds a protected file."""
        if self.secret_index is None or not tokens:
            return None
        prog = re.split(r"[\\/]", tokens[0].strip("\"'"))[-1].lower()
        if not _READ_VERB.match(prog):
            return None
        pattern_first = bool(re.match(r"^(sed|awk|grep|egrep|fgrep|zgrep|rg|findstr|select-string|sls)(\.exe)?$", prog))
        for t in tokens[1:]:
            if t.startswith("-") or (t.startswith("/") and len(t) <= 3):
                continue
            if pattern_first:  # the pattern / program text, not a file name
                pattern_first = False
                continue
            if re.search(r"\$\(|`", t) or (("$" in t) and not re.search(r"[\s^\\\[\]|+?]", t)
                                           and _expand_path(t, cwd, env) is None):
                return (f"{self.role} 역할: `{prog}`가 읽을 파일 이름이 실행 중에 만들어져 guard가 확인할 수 없습니다 — "
                        f"경로를 직접 쓰세요.")
        if _RECURSIVE_SEARCH.search(head):
            visible_only = prog.startswith("rg") and not _RG_SEES_HIDDEN.search(" " + head)
            rest = [t for t in tokens[1:] if not t.startswith("-")]
            if re.match(r"^(grep|egrep|fgrep|zgrep|rg|findstr|select-string|sls)(\.exe)?$", prog) and rest:
                rest = rest[1:]  # drop the pattern
            dirs: List[Path] = []
            for t in rest:
                p = _expand_path(t, cwd, env)
                if p is not None and p.is_absolute() and p.is_dir():
                    dirs.append(p)
            if not rest and cwd:  # no path given: the search runs over the working folder
                dirs = [Path(cwd)]
            for d in dirs:
                if self.secret_index.inside(d, visible_only=visible_only):
                    return (f"{self.role} 역할: 이 폴더 전체 검색에는 비밀 파일이 들어 있습니다: {str(d)[:100]} — "
                            f"검색 범위를 하위 폴더로 좁히세요.")
        return None

    def _code_violation(self, code: Any, label: str) -> Optional[str]:
        """Checks for program text a worker is about to run (execute_code, python -c, heredoc, script file)."""
        if not isinstance(code, str) or not code.strip():
            return None
        if self.comment_rules and self.strict_issue and _hidden_transition(code, True):
            return (f"{label} 안에서 작업 상태(done/in_progress)를 바꿀 수 없습니다 — 완료 댓글 검사를 위해 "
                    f"curl -d '<JSON>' / heredoc(@-) / 미리 만든 파일(-d @절대경로)로 보내세요.")
        if self.protect_read and _SECRET_IN_CODE.search(code):
            return f"{label} 안에서 비밀 파일(.env·auth.json 등)을 다룰 수 없습니다 — 필요한 값이 있으면 사장님께 요청하세요."
        if (self.protect_write or self.protect_other_profiles) and (_PY_DANGER.search(code) or _JS_DANGER.search(code)
                                                                     or _PY_OPEN_WRITE.search(code)):
            for lit in re.findall(r"['\"]([^'\"\n]{4,300})['\"]", code):
                if ("/" in lit or "\\" in lit) and (reason := self._protected_write(lit, None, self._env)):
                    return f"{label}: {reason}"
        return None

    def _write_targets(self, head: str, shape: str, quoted: List[str]) -> List[str]:
        targets: List[str] = []
        if _WRITE_VERB.search(head):
            toks = [t for t in _ordered_tokens(shape, quoted)[1:] if not t.startswith("-") and not re.fullmatch(r"/[a-zA-Z]+", t)]
            targets += toks[-1:] if _LAST_ARG_ONLY.match(head) else toks
        for m in _REDIRECT.finditer(shape):
            targets.append(quoted[int(m.group(1))] if m.group(1) is not None else m.group(2))
        for m in _OUTPUT_FLAG.finditer(shape):
            targets.append(quoted[int(m.group(1))] if m.group(1) is not None else m.group(2))
        return [t for t in targets if t not in ("/dev/null", "NUL", "nul")]

    def _check_terminal_strict(self, cmd: str, workdir: Any) -> Optional[str]:
        cwd: Optional[str] = workdir if isinstance(workdir, str) and workdir else None
        env = dict(self._env)
        mutated = False  # an earlier segment of this command line may have produced files
        for seg in _split_command_line(cmd):
            shape, quoted = _strip_data(seg)
            head = shape.lstrip()
            if m := _CD_SEG.match(head):
                p = _expand_path(quoted[int(m.group(1))] if m.group(1) is not None else m.group(2), cwd, env)
                cwd = str(p) if p else None
                continue
            if m := _ASSIGN_SEG.match(head):
                val = quoted[int(m.group(2))] if m.group(2) is not None else (m.group(3) or "")
                if "$(" in val or "`" in val:
                    env.pop(m.group(1), None)
                    env[m.group(1) + "__opaque"] = "1"
                else:
                    env[m.group(1)] = re.sub(r"\$\{(\w+)[^}]*\}|\$(\w+)",
                                             lambda v: env.get(v.group(1) or v.group(2)) or os.environ.get(v.group(1) or v.group(2)) or v.group(0), val)
                continue
            if _HEREDOC_BODY.search(seg) is None:
                tokens = _ordered_tokens(shape, quoted)
            else:
                tokens = _ordered_tokens(_HEREDOC_BODY.sub(lambda h: h.group(1) + h.group(4), shape), quoted)
            if self.protect_read:
                for t in tokens:
                    if reason := self._protected_read(t, cwd, env):
                        return reason
                if reason := self._terminal_read_checks(head, tokens, cwd, env):
                    return reason
                if re.match(r"^(echo|printf|print|Write-Output|Write-Host|cat\s+<<<)\b", head, re.I) and \
                        any(re.search(r"\$(\{(env:)?\w*(KEY|TOKEN|SECRET|PASSWORD)\w*(?!:?\+)[^}]*\}|(env:)?\w*(KEY|TOKEN|SECRET|PASSWORD)\w*\b(?!\}))",
                                      t, re.I) for t in tokens[1:]):
                    return f"{self.role} 역할은 비밀 값(API 키·토큰)을 화면에 출력할 수 없습니다."
            if self.protect_write and head.lower().startswith(("rm ", "del ", "erase ", "remove-item", "ri ", "unlink ")):
                for t in tokens[1:]:
                    if _DB_FILE.search(t):
                        return f"{self.role} 역할은 DB 파일을 지울 수 없습니다: {t} — 사장님께 보고하세요."
            for t in self._write_targets(head, shape, quoted):
                if reason := self._protected_write(t, cwd, env):
                    return reason
            if self.strict_issue and _OTHER_HTTP.match(head) and any(re.search(r"/api/|paperclip|:3100", t, re.I) for t in tokens):
                return "Paperclip 작업 API에는 curl만 쓰세요(wget·Invoke-WebRequest·httpie 등은 guard가 본문을 확인할 수 없음)."
            if self.strict_issue and self.comment_rules and head.startswith("curl") and _ISSUE_CALL.search(shape):
                url_hit = any(_ISSUE_URL.search(q + " ") for q in quoted) or _ISSUE_URL.search(shape)
                texts, opaque = _issue_payloads_strict(seg, shape, quoted, cwd, env)
                if url_hit:
                    has_file = any(v.startswith("@") and v != "@-" for _, v in _body_args(shape, quoted))
                    if opaque is None and mutated and has_file:
                        opaque = next(v for _, v in _body_args(shape, quoted) if v.startswith("@") and v != "@-")
                        return (f"이 명령 안에서 방금 만든 파일(`{opaque}`)은 guard가 확인할 수 없습니다 — 파일을 먼저 만든 뒤 "
                                f"curl은 별도 호출로 보내거나, curl에 heredoc(--data-binary @- <<'EOF')으로 직접 넣으세요.")
                    if opaque is not None:
                        return f"작업 API 요청 본문 `{opaque[:60]}`: " + _OPAQUE_HINT
                    for text in texts:
                        if self.title_rules:
                            for title in _issue_titles_from_json(text):
                                if reason := self.title_rules.check(title):
                                    return reason
                        if body := _issue_body_from_json(text):
                            if reason := self.comment_rules.check_body(body):
                                return reason
                elif not any(re.search(r"/api/|://", t) for t in tokens):
                    bodies = [v for _, v in _body_args(shape, quoted)] + ([h.group(3)] if (h := _HEREDOC_BODY.search(seg)) else [])
                    if any(v.startswith("@") or "$" in v or _PROGRAM_TRANSITION_STRICT.search(v) or '"status"' in v for v in bodies):
                        return "요청 주소가 변수에 숨어 있어 guard가 확인할 수 없습니다 — 작업 API 주소를 명령에 직접 쓰세요."
            code: Optional["tuple[str, str]"] = None
            if (h := _HEREDOC_BODY.search(seg)) and _HEREDOC_PROGRAM.match(head):
                code = (h.group(3), "heredoc 프로그램")
            elif m := _PY_INLINE.match(head):
                code = (quoted[int(m.group(1))], "python -c")
            elif m := _JS_INLINE.match(head):
                code = (quoted[int(m.group(2))], "node -e")
            elif self.strict_issue and (m := _SCRIPT_RUN.match(head)):  # repo scripts the chief/reviewer run may manage .env themselves
                sp = _expand_path(quoted[int(m.group(1))] if m.group(1) is not None else m.group(2), cwd, env)
                try:
                    code = (sp.read_text(encoding="utf-8", errors="replace"), f"스크립트 {sp.name}") if sp else None
                except OSError:
                    code = None
            if code and (reason := self._code_violation(code[0], code[1])):
                return reason
            if not _READONLY_SEG.match(head) or _REDIRECT.search(shape):
                mutated = True
        return None

    def _check_skill_own(self, args: Dict[str, Any]) -> Optional[str]:
        ops = args.get("operations") if isinstance(args.get("operations"), list) else [args]
        for op in ops:
            if not isinstance(op, dict):
                continue
            action, name = str(op.get("action") or ""), str(op.get("name") or args.get("name") or "")
            if action == "create":
                continue  # lands in this bot's own skills dir
            own = bool(self.home and name and any((self.home / "skills").glob(f"**/{name}/SKILL.md")))
            if not own:
                return (f"{self.role} 역할은 자기 스킬만 고칠 수 있습니다('{name}'은 다른 봇·공용 스킬). "
                        f"바꿔야 하면 사장님이나 비서실장에게 요청하세요.")
        return None

    def _check_strict_tool(self, tool_name: str, args: Dict[str, Any]) -> Optional[str]:
        if self._secret_values:
            blob = json.dumps(args, ensure_ascii=False)
            if any(v in blob for v in self._secret_values):
                return (f"{self.role} 역할은 비밀 값(API 키·토큰)을 명령·파일·댓글에 넣을 수 없습니다. "
                        f"키는 $PAPERCLIP_API_KEY 처럼 변수 이름으로만 쓰세요.")
        if tool_name in _READ_TOOLS and self.protect_read:
            p = args.get(_READ_TOOLS[tool_name])
            if tool_name == "search_files" and not p:
                p = "."
            if isinstance(p, str) and p and (reason := self._protected_read(p)):
                return reason
            if isinstance(p, str) and p and (reason := self._read_scope(tool_name, p, args)):
                return reason
        if tool_name in ("write_file", "patch"):
            p = args.get("path")
            if isinstance(p, str) and (reason := self._protected_write(p, None, self._env)):
                return reason
        if tool_name == "skill_manage" and self.skills_own_only:
            if reason := self._check_skill_own(args):
                return reason
        if tool_name in _CODE_TOOLS:
            if reason := self._code_violation(args.get("code"), tool_name):
                return reason
        return None

    # ---- public ----

    def evaluate(self, tool_name: str, args: Any, session_id: str = "") -> Optional[str]:
        """Return the violation reason, or None when the call is fine for this role."""
        args = args if isinstance(args, dict) else {}
        reason = self._check_budget(session_id) or self._check_tool(tool_name)
        if reason is None and (self.strict_issue or self.protect_write or self.protect_read or self.protect_other_profiles
                               or self.skills_own_only):
            reason = self._check_strict_tool(tool_name, args)
        if reason is None and tool_name == "skill_manage":
            reason = self._check_skill_manage(args)
        if reason is None and tool_name in _WRITE_TOOLS:
            reason = self._check_write(tool_name, args)
        if reason is None and self.title_rules and tool_name == "write_file":
            for title in _issue_titles_from_json(args.get("content")):
                if reason := self.title_rules.check(title):
                    break
        if reason is None and self.comment_rules and tool_name in _WRITE_TOOLS:
            content = args.get("content") if tool_name == "write_file" else args.get("new_string")
            if body := _issue_body_from_json(content):
                reason = self.comment_rules.check_body(body)
            elif _hidden_transition(content, self.strict_issue):
                reason = ("작업 상태 변경(done/in_progress)은 스크립트 안에서 보내지 마세요 — 완료 댓글 검사를 위해 "
                          "curl -d '<JSON>' / heredoc / @file 처럼 본문이 보이는 형태로 보내야 합니다.")
        if reason is None and tool_name in _TERMINAL_TOOLS:
            reason = self._check_terminal(args)
        return reason

    def decide(self, tool_name: str, args: Any, session_id: str = "") -> Optional[Dict[str, str]]:
        """Hook-shaped result: block dict in block mode, None otherwise. Always logs violations."""
        reason = self.evaluate(tool_name, args, session_id)
        if reason is None:
            return None
        self._log({"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "role": self.role, "mode": self.mode,
                   "session": session_id, "tool": tool_name, "reason": reason,
                   "args": self._redact(_brief_args(tool_name, args))})
        if self.mode != "block":
            logger.warning("agentos-guard[warn] %s %s: %s", self.role, tool_name, reason)
            return None
        return {"action": "block",
                "message": f"[agentos-guard] 차단: {reason}\n우회하지 말고, 이 일은 담당 봇에게 위임하거나 비서실장/사장님께 보고하세요."}

    def _redact(self, d: Dict[str, Any]) -> Dict[str, Any]:
        if not self._secret_values:
            return d
        out = {}
        for k, v in d.items():
            for s in self._secret_values:
                v = v.replace(s, "[secret]") if isinstance(v, str) else v
            out[k] = v
        return out

    def _log(self, rec: Dict[str, Any]) -> None:
        if not self.log_path:
            return
        try:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except OSError as exc:  # never let logging break the agent loop
            logger.debug("agentos-guard log write failed: %s", exc)


def _brief_args(tool_name: str, args: Any) -> Dict[str, Any]:
    if not isinstance(args, dict):
        return {}
    keep = ("command", "path", "file_path", "action", "name")
    return {k: (str(v)[:200]) for k, v in args.items() if k in keep}


def load_rules(path: Path = _HERE / "rules.yaml") -> Dict[str, Any]:
    import yaml  # PyYAML ships with Hermes
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict) or "roles" not in data:
        raise ValueError(f"agentos-guard: {path} has no 'roles' block")
    return data


_guard: Optional[Guard] = None


def register(ctx) -> None:
    global _guard
    role = str(ctx.get_config("role", "worker") or "worker").strip().lower()
    mode = str(ctx.get_config("mode", "warn") or "warn").strip().lower()
    try:
        from hermes_constants import get_hermes_home
        home = get_hermes_home()
        log_path = home / "logs" / "guard.jsonl"
    except Exception:  # pragma: no cover - outside Hermes
        home, log_path = None, None
    guard = Guard(load_rules(), role, mode, log_path, home)
    _guard = guard
    logger.info("agentos-guard registered: role=%s mode=%s max_tool_calls=%d", role, mode, guard.max_calls)

    def _on_pre_tool_call(tool_name: str = "", args: Any = None, session_id: str = "", **_: Any):
        return guard.decide(tool_name, args, session_id or "")

    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
