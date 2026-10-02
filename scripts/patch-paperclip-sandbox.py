#!/usr/bin/env python3
"""Idempotent local fixes for the Paperclip local-process sandbox (bwrap).

Fix 1 - merged-/usr (paperclipai/paperclip#10684):
  With filesystemScope=workspace the sandbox unconditionally creates
  `--symlink usr/bin /bin` (etc.) and then also `--ro-bind`s /bin, /sbin, /lib,
  /lib64. On merged-/usr hosts (Ubuntu >= 21.04) those are host symlinks; bwrap
  resolves the source to /usr/bin and mounts it onto the synthetic symlink before
  /usr exists -> "Can't bind mount /oldroot/usr/bin on /newroot/bin". The run
  never starts. Fix: mirror the host layout - create a synthetic symlink only
  when the host path is a symlink (with the host's own target) and skip binding
  it; real directories are still bound. Works on merged and split /usr.

Fix 2 - allowlist bridge hang:
  With networkScope=allowlist the in-sandbox bridge waits in server.close() for
  every proxied socket before exiting. A lingering grandchild (e.g. an MCP or
  background process spawned by the agent) keeps its proxy socket open, so the
  bridge - PID 1 of the sandbox namespace - never exits. Paperclip then SIGTERMs
  the run after the terminal-result grace period and records a completed run
  as `adapter_failed`. Fix: when the agent process exits, stop accepting
  connections and exit immediately; the PID namespace teardown reaps leftovers.
  Also drop the bridge's own signal forwarder before re-raising the agent's exit
  signal, so the re-raise actually terminates the bridge.

Fix 3 - skills invisible inside the sandbox:
  The Claude prompt bundle mounted into the sandbox holds `.claude/skills/<name>`
  as symlinks to the Paperclip install (outside the sandbox), so the agent sees
  dangling links and cannot load the `paperclip` skill (how to call the issue
  API). Fix: read-only bind the resolved target of each skill symlink found in
  managed paths.

Usage: patch-paperclip-sandbox.py [--check] [--revert] [FILE ...]
Without FILE, every managed install under ~/.paperclip/cli/installs/npm/* is
processed. Safe to run on every service start (systemd ExecStartPre=-...): each
fix is idempotent, and a fix whose upstream code shape changed is skipped (not
forced) so an upstream release that already fixed it is left alone.
"""
import glob, hashlib, os, shutil, sys

INSTALL_GLOB = os.path.expanduser(
    "~/.paperclip/cli/installs/npm/*/node_modules/@paperclipai/adapter-utils/dist/local-process-sandbox.js")

MERGED_USR_MARKER = "/* agentos-local-fix: merged-usr sandbox (paperclip#10684) */"
BRIDGE_MARKER = "/* agentos-local-fix: bridge exits with agent */"
SKILL_LINKS_MARKER = "/* agentos-local-fix: mount skill link targets */"

FIXES = [
    {
        "name": "merged-usr",
        "marker": MERGED_USR_MARKER,
        "edits": [
            (
                '        args.push("--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64");\n',
                '        ' + MERGED_USR_MARKER + '\n'
                '        const hostSystemLinks = new Set();\n'
                '        for (const linkPath of ["/bin", "/sbin", "/lib", "/lib64"]) {\n'
                '            const linkTarget = await fs.readlink(linkPath).catch(() => null);\n'
                '            if (linkTarget === null)\n'
                '                continue;\n'
                '            args.push("--symlink", linkTarget, linkPath);\n'
                '            hostSystemLinks.add(linkPath);\n'
                '        }\n',
            ),
            (
                '        for (const systemPath of SYSTEM_READ_PATHS)\n            await mount(systemPath, "ro");\n',
                '        for (const systemPath of SYSTEM_READ_PATHS) {\n'
                '            if (hostSystemLinks.has(systemPath))\n'
                '                continue;\n'
                '            await mount(systemPath, "ro");\n'
                '        }\n',
            ),
        ],
    },
    {
        "name": "bridge-exit",
        "marker": BRIDGE_MARKER,
        "edits": [
            (
                '  child.on("exit", (code, signal) => server.close(() => {\n'
                '    if (signal) process.kill(process.pid, signal);\n'
                '    else process.exit(code == null ? 1 : code);\n'
                '  }));\n',
                '  ' + BRIDGE_MARKER + '\n'
                '  child.on("exit", (code, signal) => {\n'
                '    server.close();\n'
                '    if (signal) {\n'
                '      process.removeAllListeners(signal);\n'
                '      process.kill(process.pid, signal);\n'
                '    }\n'
                '    process.exit(code == null ? 1 : code);\n'
                '  });\n',
            ),
        ],
    },
    {
        "name": "skill-links",
        "marker": SKILL_LINKS_MARKER,
        "edits": [
            (
                '        for (const managedPath of input.options.managedPaths ?? [])\n'
                '            await mount(managedPath.path, managedPath.access);\n',
                '        for (const managedPath of input.options.managedPaths ?? [])\n'
                '            await mount(managedPath.path, managedPath.access);\n'
                '        ' + SKILL_LINKS_MARKER + '\n'
                '        for (const managedPath of input.options.managedPaths ?? []) {\n'
                '            const skillsDir = path.join(managedPath.path, ".claude", "skills");\n'
                '            const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);\n'
                '            for (const entry of entries) {\n'
                '                if (!entry.isSymbolicLink())\n'
                '                    continue;\n'
                '                const target = await fs.realpath(path.join(skillsDir, entry.name)).catch(() => null);\n'
                '                if (target)\n'
                '                    await mount(target, "ro");\n'
                '            }\n'
                '        }\n',
            ),
        ],
    },
]


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()[:16]


def process(path, mode):
    backup = path + ".orig"
    src = open(path, encoding="utf-8").read()
    state = {f["name"]: f["marker"] in src for f in FIXES}

    if mode == "check":
        print(f"file={path}")
        for name, applied in state.items():
            print(f"{name}={'applied' if applied else 'not-applied'}")
        print(f"patched={all(state.values())}\nsha16={sha(path)}\nbackup={'present' if os.path.exists(backup) else 'absent'}")
        return 0
    if mode == "revert":
        if not os.path.exists(backup):
            print(f"{path}: no backup; nothing to revert"); return 1
        shutil.copy2(backup, path); print(f"{path}: reverted sha16={sha(path)}"); return 0

    out, rc, changed = src, 0, []
    for fix in FIXES:
        if state[fix["name"]]:
            continue
        if any(out.count(old) != 1 for old, _ in fix["edits"]):
            print(f"{path}: {fix['name']}: upstream code changed; skipped (check whether upstream already fixed it)")
            rc = 2
            continue
        for old, new in fix["edits"]:
            out = out.replace(old, new)
        changed.append(fix["name"])
    if not changed:
        print(f"{path}: nothing to apply sha16={sha(path)}")
        return rc
    if not os.path.exists(backup):
        shutil.copy2(path, backup)
    tmp = path + ".tmp-agentos"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(out)
    shutil.copymode(path, tmp)
    os.replace(tmp, path)
    print(f"{path}: applied {','.join(changed)} sha16={sha(path)} backup={backup}")
    return rc


def main():
    mode = "check" if "--check" in sys.argv else "revert" if "--revert" in sys.argv else "apply"
    files = [a for a in sys.argv[1:] if not a.startswith("--")] or sorted(glob.glob(INSTALL_GLOB))
    if not files:
        print("no Paperclip install found"); return 1
    return max(process(f, mode) for f in files)


if __name__ == "__main__":
    sys.exit(main())
