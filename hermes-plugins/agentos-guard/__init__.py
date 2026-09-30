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
_VALID_ROLES = ("chief", "reviewer", "worker")
_VALID_MODES = ("warn", "block")
_WRITE_TOOLS = {"write_file": "path", "patch": "path", "skill_manage": "file_path"}
_TERMINAL_TOOLS = ("terminal", "process_manage")


def _split_command_line(cmd: str) -> List[str]:
    """Split a shell command line into pipeline/sequence segments (``|``, ``&&``, ``||``, ``;``, newline),
    ignoring separators inside single/double quotes and inside heredoc bodies (``<<EOF`` … ``EOF``)."""
    segs, buf, quote, i = [], [], None, 0
    heredoc_end: Optional[str] = None  # set when the current line opened a heredoc; body swallowed until the terminator
    while i < len(cmd):
        ch = cmd[i]
        if heredoc_end is not None:
            # consume whole lines until the terminator line
            nl = cmd.find("\n", i)
            line = cmd[i:] if nl < 0 else cmd[i:nl]
            buf.append(line + "\n")
            if line.strip() == heredoc_end:
                heredoc_end = None
                segs.append("".join(buf)); buf = []
            i = len(cmd) if nl < 0 else nl + 1
            continue
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
            buf.append(ch)
        elif cmd.startswith(("||", "&&"), i):
            segs.append("".join(buf)); buf = []; i += 1
        elif ch == "\n" and (m := re.search(r"<<-?\s*['\"]?(\w+)['\"]?\s*$", "".join(buf))):
            heredoc_end = m.group(1)
            buf.append(ch)
        elif ch in "|;\n":
            segs.append("".join(buf)); buf = []
        else:
            buf.append(ch)
        i += 1
    segs.append("".join(buf))
    return [s.strip() for s in segs if s.strip()]


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
# (comments/documents/execution sub-paths are excluded by the URL regex).
_ISSUE_CALL = re.compile(r"^curl\b.*(\s-d\b|\s--data(-binary|-raw)?\b|\s-X\s*(POST|PATCH)\b|<<)")
_ISSUE_URL = re.compile(r"/api/(companies/[^/\s\"']+/)?issues(/[0-9a-f-]{36})?[\"']?(\s|$)")
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


def _hidden_transition(text: Any) -> bool:
    if not isinstance(text, str) or not text.strip():
        return False
    if _issue_body_from_json(text) is not None:
        return False  # plain JSON body — the gate can read it
    return bool(_PROGRAM_TRANSITION.search(text) and _PROGRAM_ISSUE_API.search(text))


def _issue_payloads_from_curl(seg: str, shape: str, quoted: List[str]) -> List[str]:
    """Raw JSON texts from an inline body (-d/--data*), a heredoc body, or an @file body in a curl to /issues."""
    url_hit = any(_ISSUE_URL.search(q + " ") for q in quoted) or _ISSUE_URL.search(shape)
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


def _issue_titles_from_curl(seg: str, shape: str, quoted: List[str]) -> List[str]:
    titles: List[str] = []
    for t in _issue_payloads_from_curl(seg, shape, quoted):
        titles += _issue_titles_from_json(t)
    return titles


class Guard:
    """Pure rule evaluator — no Hermes imports, so it is unit-testable and reusable."""

    def __init__(self, rules: Dict[str, Any], role: str, mode: str, log_path: Optional[Path] = None):
        if role not in _VALID_ROLES:
            raise ValueError(f"agentos-guard: unknown role {role!r} (valid: {', '.join(_VALID_ROLES)})")
        if mode not in _VALID_MODES:
            raise ValueError(f"agentos-guard: unknown mode {mode!r} (valid: {', '.join(_VALID_MODES)})")
        self.role, self.mode, self.log_path = role, mode, log_path
        r = (rules.get("roles") or {}).get(role) or {}
        self.title_rules = TitleRules(rules.get("issue_title") or {}) if r.get("check_issue_title") else None
        self.comment_rules = (CommentRules(rules.get("issue_comment") or {}, bool(r.get("check_done_comment")), bool(r.get("check_reject_comment")))
                              if r.get("check_done_comment") or r.get("check_reject_comment") else None)
        self.deny_tools = set(((r.get("tools") or {}).get("deny")) or [])
        self.deny_skill_actions = set(((r.get("skill_manage") or {}).get("deny_actions")) or [])
        w = r.get("write") or {}
        self.allow_paths = [str(p) for p in (w.get("allow_paths") or [])]
        self.any_ext_paths = [str(p) for p in (w.get("any_ext_paths") or [])]
        self.deny_ext = {str(e).lower() for e in (w.get("deny_ext") or [])}
        t = r.get("terminal") or {}
        self.term_allow = [re.compile(p) for p in (t.get("allow") or [])]
        self.term_deny = [re.compile(p) for p in (t.get("deny") or [])]
        self.inline_python_guard = bool(t.get("inline_python_guard", False))
        self.redirect_guard = bool(t.get("redirect_guard", False))
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
        for seg in _split_command_line(cmd):
            shape, quoted = _strip_data(seg)
            if (self.title_rules or self.comment_rules) and _ISSUE_CALL.search(shape):
                for text in _issue_payloads_from_curl(seg, shape, quoted):
                    if self.title_rules:
                        for title in _issue_titles_from_json(text):
                            if reason := self.title_rules.check(title):
                                return reason
                    if self.comment_rules and (body := _issue_body_from_json(text)):
                        if reason := self.comment_rules.check_body(body):
                            return reason
            if _SHELL_ESCAPE.search(shape):
                return f"{self.role} 역할은 셸 인터프리터에 명령 문자열을 넘길 수 없습니다: `{seg[:120]}`"
            if self.redirect_guard:
                for m in _REDIRECT.finditer(shape):
                    target = quoted[int(m.group(1))] if m.group(1) is not None else m.group(2)
                    if target not in ("/dev/null", "NUL", "nul") and not _REDIRECT_OK.search(target):
                        return f"{self.role} 역할은 파일로 출력을 저장할 수 없습니다(scratch/evidence 폴더만 가능): `{target}`"
            for pat in self.term_deny:
                m = pat.search(shape)
                if m:
                    return f"{self.role} 역할에 금지된 명령입니다: '{m.group(0).strip()}' in `{seg[:120]}`"
            if self.comment_rules and not self.inline_python_guard:
                for pat, idx in ((_PY_INLINE, 1), (_JS_INLINE, 2)):
                    if (m := pat.match(shape)) and _hidden_transition(quoted[int(m.group(idx))]):
                        return "인라인 프로그램 안에서 작업 상태를 바꿀 수 없습니다 — curl -d '<JSON>' 처럼 본문이 보이는 형태로 보내세요."
            if self.inline_python_guard:
                inline = None
                if m := _PY_INLINE.match(shape):
                    inline = (quoted[int(m.group(1))], _PY_DANGER, "python -c")
                elif m := _JS_INLINE.match(shape):
                    inline = (quoted[int(m.group(2))], _JS_DANGER, "node -e")
                if inline is not None:
                    code, danger, label = inline
                    if d := danger.search(code):
                        return f"{self.role} 역할의 {label} 안에 금지 동작이 있습니다: '{d.group(0)}'"
                    if self.comment_rules and _hidden_transition(code):
                        return f"{label} 안에서 작업 상태를 바꿀 수 없습니다 — curl -d '<JSON>' 처럼 본문이 보이는 형태로 보내세요."
                    continue  # inline program passed its own check; skip the allow list
            if self.term_allow and not any(p.search(shape) for p in self.term_allow):
                return f"{self.role} 역할의 허용 명령 목록에 없습니다: `{seg[:120]}`"
        return None

    # ---- public ----

    def evaluate(self, tool_name: str, args: Any, session_id: str = "") -> Optional[str]:
        """Return the violation reason, or None when the call is fine for this role."""
        args = args if isinstance(args, dict) else {}
        reason = self._check_budget(session_id) or self._check_tool(tool_name)
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
            elif _hidden_transition(content):
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
                   "args": _brief_args(tool_name, args)})
        if self.mode != "block":
            logger.warning("agentos-guard[warn] %s %s: %s", self.role, tool_name, reason)
            return None
        return {"action": "block",
                "message": f"[agentos-guard] 차단: {reason}\n우회하지 말고, 이 일은 담당 봇에게 위임하거나 비서실장/사장님께 보고하세요."}

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
        log_path = get_hermes_home() / "logs" / "guard.jsonl"
    except Exception:  # pragma: no cover - outside Hermes
        log_path = None
    guard = Guard(load_rules(), role, mode, log_path)
    _guard = guard
    logger.info("agentos-guard registered: role=%s mode=%s max_tool_calls=%d", role, mode, guard.max_calls)

    def _on_pre_tool_call(tool_name: str = "", args: Any = None, session_id: str = "", **_: Any):
        return guard.decide(tool_name, args, session_id or "")

    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
