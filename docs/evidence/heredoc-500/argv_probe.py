"""Isolate where '\\' collapses: Python Popen([bash, -c, cmd]) on Windows (same as Hermes local.py:999) vs. stdin script."""
import subprocess, shutil
bash = r"C:\Program Files\Git\bin\bash.exe"
cmd = "printf '%s' 'a\\\\b' | od -An -c"   # the bash source contains: 'a\\b'  (two backslashes)
assert cmd.count("\\") == 2
print("argv  -c :", subprocess.run([bash, "-c", cmd], capture_output=True, text=True).stdout.strip())
print("stdin    :", subprocess.run([bash, "-s"], input=cmd, capture_output=True, text=True).stdout.strip())
print("cmdline  :", subprocess.list2cmdline([bash, "-c", cmd]))
cmd2 = 'printf "%s" "a\\\\b" | od -An -c'  # double-quoted variant: bash itself turns \\ into \ inside "..."
print("dq -c    :", subprocess.run([bash, "-c", cmd2], capture_output=True, text=True).stdout.strip())
cmd3 = "cat <<'EOF' | od -An -c\na\\\\b\nEOF"
print("heredoc-c:", subprocess.run([bash, "-c", cmd3], capture_output=True, text=True).stdout.strip())
print("heredoc-s:", subprocess.run([bash, "-s"], input=cmd3, capture_output=True, text=True).stdout.strip())
