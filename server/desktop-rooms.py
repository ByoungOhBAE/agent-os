"""Read-only live view of Hermes *desktop* group rooms for the AgentOS BFF.

Desktop (legacy) rooms are orchestrated by the Hermes desktop app, not by the
gateway's hosted-room engine, so ``groups.*`` cannot see them. Two durable
sources can:

* the default profile's ``profile.yaml`` -> ``ui_meta.hermes-bots-groups.rooms``
  (the desktop's bounded room transcript mirror, updated as replies land), and
* each member bot's own ``state.db`` session titled ``Group: <room> · <thread>``,
  which Hermes flushes *during* a turn (tool calls are persisted before they run),
  so it shows what a bot is doing right now.

Output (one JSON document): rooms with their recent transcript plus, per member,
the live steps of its latest turn. Databases open read-only; nothing is written.
No prompts, reasoning, tool outputs or credentials are emitted, and every text is
passed through a secret redactor.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

import yaml

PROFILE_NAME = re.compile(r"^[\w.-]{1,64}$")
ROOM_ID = re.compile(r"^[\w-]{1,64}$")
LOG_LIMIT = 40
TEXT_LIMIT = 4000
STEP_LIMIT = 14
MESSAGE_WINDOW = 120
# A turn with no new message for this long is reported as stalled, not working.
STALL_SECONDS = 20 * 60

SECRET = re.compile(
    r"(sk-ant-[\w-]{8,}|sk-[A-Za-z0-9_-]{20,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*|gh[pousr]_[A-Za-z0-9]{20,}"
    r"|xox[abpr]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}"
    r"|(?i:bearer)\s+[\w.~+/-]{16,}=*"
    r"|(?i:(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*)[^\s\"',;]{6,})"
)

TOOL_LABELS = {
    "terminal": "명령 실행", "process": "명령 실행", "execute_code": "코드 실행",
    "read_file": "파일 읽기", "write_file": "파일 쓰기", "patch": "파일 수정", "search_files": "파일 검색",
    "web_search": "웹 검색", "web_extract": "웹 읽기", "vision_analyze": "이미지 보기",
    "skill_view": "스킬 확인", "skill_manage": "스킬 기록", "skills_list": "스킬 목록",
    "delegate_task": "하위 작업 맡김", "todo": "할 일 정리", "memory": "메모 기록",
    "clarify": "질문", "session_search": "이전 대화 찾기",
}


def redact(text: str) -> str:
    return SECRET.sub("[비공개]", text)


def clip(value: object, limit: int) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return redact(value[:limit])


def home() -> Path:
    env = os.environ.get("HERMES_HOME")
    if env:
        return Path(env)
    return Path(os.environ.get("LOCALAPPDATA", "")) / "hermes"


def load_yaml(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}
    return data if isinstance(data, dict) else {}


def bot_title(root: Path, profile: str) -> str | None:
    directory = root if profile == "default" else root / "profiles" / profile
    meta = load_yaml(directory / "profile.yaml").get("ui_meta")
    bot = meta.get("hermes-bots") if isinstance(meta, dict) else None
    return clip(bot.get("title"), 80) if isinstance(bot, dict) else None


def tool_hint(name: str, raw_args: object) -> str | None:
    """A short, safe description of what a tool call touches (never full payloads)."""
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    except ValueError:
        return None
    if not isinstance(args, dict):
        return None
    if name in ("read_file", "write_file", "patch") and isinstance(args.get("path"), str):
        parts = re.split(r"[\\/]", args["path"])
        return "/".join(parts[-2:])[:80]
    if name == "search_files" and isinstance(args.get("pattern"), str):
        return args["pattern"][:60]
    if name == "terminal" and isinstance(args.get("command"), str):
        return args["command"].strip().splitlines()[0][:90]
    if name == "web_search" and isinstance(args.get("query"), str):
        return args["query"][:80]
    if name in ("skill_view", "skill_manage") and isinstance(args.get("name"), str):
        return args["name"][:60]
    if name == "delegate_task" and isinstance(args.get("goal"), str):
        return args["goal"][:80]
    return None


def live_turn(root: Path, profile: str, room_id: str, now: float) -> dict | None:
    directory = root if profile == "default" else root / "profiles" / profile
    db_path = directory / "state.db"
    if not db_path.is_file():
        return None
    try:
        db = sqlite3.connect(f"{db_path.resolve().as_uri()}?mode=ro", uri=True, timeout=3)
    except sqlite3.Error:
        return None
    try:
        row = db.execute(
            """
            SELECT s.id, s.title, (SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id) AS last
            FROM sessions s
            WHERE s.hidden = 1 AND (s.title LIKE ? OR s.title LIKE ?)
            ORDER BY last DESC LIMIT 1
            """,
            (f"Group: {room_id} · %", f"Group: id:{room_id} · %"),
        ).fetchone()
        if not row or row[2] is None:
            return None
        session_id, title, _ = row
        # Read the whole latest turn (from the last user row), however long it is; bodies are
        # truncated in SQL so a 500-step turn stays cheap.
        start_row = db.execute(
            "SELECT MAX(id) FROM messages WHERE session_id = ? AND role = 'user' AND COALESCE(active, 1) = 1",
            (session_id,),
        ).fetchone()
        if not start_row or start_row[0] is None:
            return None
        started_at, tool_total = db.execute(
            """
            SELECT MIN(timestamp), SUM(CASE WHEN role = 'tool' THEN 1 ELSE 0 END) FROM messages
            WHERE session_id = ? AND id >= ? AND COALESCE(active, 1) = 1
            """,
            (session_id, start_row[0]),
        ).fetchone()
        # Newest rows of the latest turn only; long turns keep their tail (what is happening now).
        rows = db.execute(
            """
            SELECT role, substr(content, 1, 1200), tool_calls, tool_name, timestamp FROM messages
            WHERE session_id = ? AND id > ? AND COALESCE(active, 1) = 1
            ORDER BY id DESC LIMIT ?
            """,
            (session_id, start_row[0], MESSAGE_WINDOW),
        ).fetchall()
    except sqlite3.Error:
        return None
    finally:
        db.close()

    rows.reverse()
    steps: list[dict] = []
    for role, content, tool_calls, tool_name, ts in rows:
        if role == "assistant":
            calls = []
            if isinstance(tool_calls, str) and tool_calls.strip():
                try:
                    calls = json.loads(tool_calls)
                except ValueError:
                    calls = []
            text = clip(content, 600) if isinstance(content, str) and content.strip() else None
            if text and not calls:
                steps.append({"kind": "reply", "text": text, "at": int(ts * 1000)})
            elif text:
                steps.append({"kind": "note", "text": text, "at": int(ts * 1000)})
            for call in calls if isinstance(calls, list) else []:
                fn = call.get("function") if isinstance(call, dict) else None
                name = fn.get("name") if isinstance(fn, dict) else None
                if not isinstance(name, str):
                    continue
                hint = tool_hint(name, fn.get("arguments"))
                steps.append({
                    "kind": "tool", "tool": name[:40], "label": TOOL_LABELS.get(name, name[:40]),
                    "hint": redact(hint) if hint else None, "done": False, "at": int(ts * 1000),
                })
        elif role == "tool":
            pending = next((s for s in reversed(steps) if s["kind"] == "tool" and not s["done"]
                            and (not tool_name or s["tool"] == tool_name)), None)
            if pending:
                pending["done"] = True
                body = content if isinstance(content, str) else ""
                pending["failed"] = bool(re.search(r'"(?:error|success)":\s*(?:"[^"]|false)|"exit_code":\s*[1-9]', body[:400]))

    if rows:
        last_role, last_content, last_calls, _, last_at = rows[-1]
    else:  # the request just arrived; nothing flushed yet
        last_role, last_content, last_calls, last_at = "user", None, None, started_at
    finished = last_role == "assistant" and not (isinstance(last_calls, str) and last_calls.strip()) \
        and isinstance(last_content, str) and last_content.strip() != ""
    if finished:
        state = "idle"
    elif now - last_at > STALL_SECONDS:
        state = "stalled"
    else:
        state = "working"
    thread = title.split(" · ", 1)[1] if " · " in title else None
    return {
        "state": state,
        "thread": thread[:64] if thread else None,
        "startedAt": int(started_at * 1000),
        "lastAt": int(last_at * 1000),
        "toolCount": int(tool_total or 0),
        "steps": steps[-STEP_LIMIT:],
    }


def main() -> None:
    root = home()
    now = time.time()
    meta = load_yaml(root / "profile.yaml").get("ui_meta")
    groups = meta.get("hermes-bots-groups") if isinstance(meta, dict) else None
    registry = groups.get("rooms") if isinstance(groups, dict) else None
    rooms = []
    titles: dict[str, str | None] = {}
    for key, room in (registry or {}).items():
        if not isinstance(room, dict):
            continue
        room_id = room.get("roomId") or str(key).removeprefix("id:")
        if not isinstance(room_id, str) or not ROOM_ID.match(room_id):
            continue
        members = []
        for m in room.get("members") or []:
            profile = (m.get("handle") or m.get("name")) if isinstance(m, dict) else m
            if not isinstance(profile, str) or not PROFILE_NAME.match(profile):
                continue
            if profile not in titles:
                titles[profile] = bot_title(root, profile)
            members.append({"profile": profile, "name": titles[profile] or profile,
                            "live": live_turn(root, profile, room_id, now)})
        log = []
        for entry in (room.get("log") or [])[-LOG_LIMIT:]:
            if not isinstance(entry, dict):
                continue
            sender = entry.get("from") if isinstance(entry.get("from"), dict) else {}
            kind = sender.get("kind")
            if kind not in ("user", "member"):
                continue
            profile = sender.get("name") if kind == "member" and isinstance(sender.get("name"), str) else None
            at = entry.get("at")
            log.append({
                "id": str(entry.get("id") or "")[:64] or None,
                "from": kind,
                "profile": profile if profile and PROFILE_NAME.match(profile) else None,
                "text": clip(entry.get("text"), TEXT_LIMIT) or "",
                "at": at if isinstance(at, (int, float)) else None,
                "thread": clip(entry.get("thread"), 64),
                "truncated": bool(entry.get("truncated")),
            })
        for item in log:
            if item["profile"] and item["profile"] not in titles:
                titles[item["profile"]] = bot_title(root, item["profile"])
            item["name"] = "나" if item["from"] == "user" else (titles.get(item["profile"] or "") or item["profile"] or "봇")
        omitted = room.get("omitted")
        rooms.append({
            "id": room_id,
            "name": clip(room.get("name"), 120) or room_id,
            "members": members,
            "log": log,
            "omitted": omitted if isinstance(omitted, int) else 0,
            "working": any(m["live"] and m["live"]["state"] == "working" for m in members),
            "updatedAt": max([e["at"] or 0 for e in log] + [(m["live"] or {}).get("lastAt") or 0 for m in members]),
        })
    rooms.sort(key=lambda r: -r["updatedAt"])
    json.dump({"rooms": rooms, "checkedAt": int(now * 1000)}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
