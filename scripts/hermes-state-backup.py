#!/usr/bin/env python3
"""Hermes bot-state backup (audit ⑥ T70): everything needed to rebuild the bot organisation's Hermes side.

For every profile under %LOCALAPPDATA%/hermes/profiles (plus the root default profile):
  config.yaml, SOUL.md, .env, memories/, skills/agentos/, skills/paperclip/, cron/jobs.json
  state.db  — copied with sqlite3's online backup API (consistent while the gateway runs)
Plus the private knowledge overlay %LOCALAPPDATA%/agentos/knowledge/*.json and the Hermes root config.yaml.
Writes MANIFEST.json + SHA256SUMS. Read-only toward Hermes. Usage: python hermes-state-backup.py [--out DIR]
Prints HERMES_BACKUP_DIR=<path> on the last line.
"""
import hashlib, json, os, shutil, sqlite3, sys, time

LOCAL = os.environ["LOCALAPPDATA"]
HOME = os.path.join(LOCAL, "hermes")
OUT = None
args = sys.argv[1:]
if "--out" in args: OUT = args[args.index("--out") + 1]
ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
dest = OUT or os.path.join(LOCAL, "agentos", "backups", f"hermes-{ts}")
os.makedirs(dest, exist_ok=False)

FILES = ["config.yaml", "SOUL.md", ".env", os.path.join("cron", "jobs.json")]
DIRS = ["memories", os.path.join("skills", "agentos"), os.path.join("skills", "paperclip")]
manifest = {"createdAt": ts, "hermesHome": HOME, "profiles": {}}

def copy_profile(name, src):
    d = os.path.join(dest, "profiles", name); os.makedirs(d, exist_ok=True)
    info = {"files": [], "dirs": [], "state_db_bytes": None, "sessions": None}
    for f in FILES:
        s = os.path.join(src, f)
        if os.path.isfile(s):
            os.makedirs(os.path.dirname(os.path.join(d, f)), exist_ok=True)
            shutil.copy2(s, os.path.join(d, f)); info["files"].append(f)
    for sub in DIRS:
        s = os.path.join(src, sub)
        if os.path.isdir(s):
            shutil.copytree(s, os.path.join(d, sub), dirs_exist_ok=True); info["dirs"].append(sub)
    db = os.path.join(src, "state.db")
    if os.path.isfile(db):
        con = sqlite3.connect(f"file:{db.replace(os.sep, '/')}?mode=ro", uri=True)
        bak = sqlite3.connect(os.path.join(d, "state.db"))
        con.backup(bak); bak.commit()
        try: info["sessions"] = bak.execute("select count(*) from sessions").fetchone()[0]
        except sqlite3.Error: info["sessions"] = -1
        bak.close(); con.close()
        info["state_db_bytes"] = os.path.getsize(os.path.join(d, "state.db"))
    manifest["profiles"][name] = info

copy_profile("default", HOME)
P = os.path.join(HOME, "profiles")
for name in sorted(os.listdir(P)):
    src = os.path.join(P, name)
    if os.path.isdir(src) and os.path.isfile(os.path.join(src, "config.yaml")): copy_profile(name, src)

K = os.path.join(LOCAL, "agentos", "knowledge")
if os.path.isdir(K):
    kd = os.path.join(dest, "agentos-knowledge"); os.makedirs(kd, exist_ok=True)
    for f in os.listdir(K):
        if f.endswith(".json"): shutil.copy2(os.path.join(K, f), os.path.join(kd, f))
    manifest["agentosKnowledge"] = sorted(f for f in os.listdir(kd))

# checksums + manifest
sums = []
for root, _, files in os.walk(dest):
    for f in sorted(files):
        p = os.path.join(root, f)
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""): h.update(chunk)
        sums.append(f"{h.hexdigest()}  {os.path.relpath(p, dest).replace(os.sep, '/')}")
manifest["fileCount"] = len(sums)
manifest["bytes"] = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(dest) for f in fs)
with open(os.path.join(dest, "MANIFEST.json"), "w", encoding="utf-8") as fh: json.dump(manifest, fh, ensure_ascii=False, indent=1)
with open(os.path.join(dest, "SHA256SUMS"), "w", encoding="utf-8", newline="\n") as fh: fh.write("\n".join(sums) + "\n")
print(f"profiles={len(manifest['profiles'])} files={manifest['fileCount']} bytes={manifest['bytes']}")
print(f"HERMES_BACKUP_DIR={dest}")
