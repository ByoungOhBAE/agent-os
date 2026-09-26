"""Read-only inventory of Hermes Bot Mode chats for the AgentOS BFF.

Bot Mode keeps each bot's 1:1 chat ("Bot Chat") and group-room threads
("Group: <room> · <thread>") as *hidden* sessions, so the dashboard's default
session list never shows them. This helper lists those sessions per bot
profile together with the room names stored in profile.yaml ``ui_meta``.

Only metadata is emitted: no prompts, config, paths, message bodies or IDs of
external chats. Databases are opened read-only. Output is one JSON document.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

import yaml

BOT_CHAT = "Bot Chat"
GROUP_TITLE = re.compile(r"^Group: ([\w-]{1,64}) · ([\w-]{1,64})$")
PROFILE_NAME = re.compile(r"^[\w.-]{1,64}$")
MAX_SESSIONS = 60


def home() -> Path:
    env = os.environ.get("HERMES_HOME")
    if env:
        return Path(env)
    return Path(os.environ.get("LOCALAPPDATA", "")) / "hermes"


def ui_meta(profile_dir: Path) -> dict:
    path = profile_dir / "profile.yaml"
    if not path.is_file():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}
    meta = data.get("ui_meta") if isinstance(data, dict) else None
    return meta if isinstance(meta, dict) else {}


def clip(value: object, limit: int) -> str | None:
    return value[:limit] if isinstance(value, str) and value else None


def bot_sessions(profile_dir: Path) -> list[dict]:
    db_path = profile_dir / "state.db"
    if not db_path.is_file():
        return []
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    try:
        db = sqlite3.connect(uri, uri=True, timeout=3)
    except sqlite3.Error:
        return []
    try:
        rows = db.execute(
            """
            SELECT id, title, message_count, started_at,
                   COALESCE(last_activity_at, ended_at, started_at), archived
            FROM sessions
            WHERE hidden = 1 AND (title = ? OR title LIKE 'Group: %')
            ORDER BY COALESCE(last_activity_at, started_at) DESC
            LIMIT ?
            """,
            (BOT_CHAT, MAX_SESSIONS),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        db.close()
    sessions = []
    for sid, title, count, started, last, archived in rows:
        if not count:
            continue  # an opened-but-never-used chat has nothing to read
        if title == BOT_CHAT:
            kind, room, thread = "direct", None, None
        else:
            match = GROUP_TITLE.match(title or "")
            if not match:
                continue
            kind, room, thread = "group", match.group(1), match.group(2)
        sessions.append({
            "id": sid, "kind": kind, "room_id": room, "thread_id": thread,
            "message_count": count if isinstance(count, int) else None,
            "started_at": started, "last_active": last, "archived": bool(archived),
        })
    return sessions


def rooms_from(meta: dict, rooms: dict, thread_labels: dict) -> None:
    groups = meta.get("hermes-bots-groups")
    registry = groups.get("rooms") if isinstance(groups, dict) else None
    if not isinstance(registry, dict):
        return
    for key, room in registry.items():
        if not isinstance(room, dict):
            continue
        room_id = room.get("roomId") or str(key).removeprefix("id:")
        if not isinstance(room_id, str) or not re.fullmatch(r"[\w-]{1,64}", room_id):
            continue
        members = [m.get("handle") or m.get("name") for m in room.get("members") or [] if isinstance(m, dict)]
        rooms[room_id] = {
            "id": room_id,
            "name": clip(room.get("name"), 120) or room_id,
            "members": [m for m in members if isinstance(m, str) and PROFILE_NAME.match(m)],
        }
        # Label each thread by the user's first line in the room log, else the first reply.
        for entry in room.get("log") or []:
            if not isinstance(entry, dict):
                continue
            thread = entry.get("thread")
            sender = entry.get("from") if isinstance(entry.get("from"), dict) else {}
            text = clip(entry.get("text"), 200)
            if not isinstance(thread, str) or not text:
                continue
            by_user = sender.get("kind") == "user"
            current = thread_labels.get(thread)
            if current is None or (by_user and not current["by_user"]):
                thread_labels[thread] = {"label": text.split("\n", 1)[0][:120], "by_user": by_user}


def main() -> None:
    root = home()
    candidates = [("default", root)]
    profiles_dir = root / "profiles"
    if profiles_dir.is_dir():
        for child in sorted(profiles_dir.iterdir()):
            # profiles/default is not a profile: "default" is the Hermes home itself.
            if child.is_dir() and child.name != "default" and PROFILE_NAME.match(child.name):
                candidates.append((child.name, child))

    rooms: dict = {}
    thread_labels: dict = {}
    bots = []
    for name, directory in candidates:
        meta = ui_meta(directory)
        rooms_from(meta, rooms, thread_labels)
        bot_meta = meta.get("hermes-bots") if isinstance(meta.get("hermes-bots"), dict) else None
        title = clip(bot_meta.get("title"), 80) if bot_meta else None
        sessions = bot_sessions(directory)
        if not title and not sessions:
            continue
        groups = bot_meta.get("groups") if bot_meta else None
        bots.append({
            "profile": name,
            "title": title,
            "groups": [g[:120] for g in groups or [] if isinstance(g, str)][:20],
            "sessions": sessions,
        })

    for bot in bots:
        for session in bot["sessions"]:
            label = thread_labels.get(session["thread_id"] or "")
            session["thread_label"] = label["label"] if label else None
            room = rooms.get(session["room_id"] or "")
            session["room_name"] = room["name"] if room else None

    bots.sort(key=lambda b: (b["title"] is None, -max([s["last_active"] or 0 for s in b["sessions"]] or [0])))
    json.dump({"bots": bots, "rooms": list(rooms.values())}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
