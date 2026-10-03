@echo off
rem The Paperclip AgentOS plugins read this loopback-only AgentOS BFF on port 4200.
rem Runs the BFF under a supervisor that restarts it after any exit and logs to
rem %LOCALAPPDATA%\agentos\logs\bff-YYYYMMDD.log. A second launch exits (single supervisor).
cd /d "C:\Users\tahar\orca\workspaces\agent os" || exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\tahar\orca\workspaces\agent os\scripts\agentos-bff-supervisor.ps1"
