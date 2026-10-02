@echo off
rem Keep WSL Ubuntu running so its enabled systemd --user Paperclip service remains available.
C:\Windows\System32\wsl.exe -d Ubuntu -- sleep infinity
