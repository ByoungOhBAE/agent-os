@echo off
rem The Paperclip Hermes plugin reads this loopback-only AgentOS BFF on port 4200.
cd /d "C:\Users\tahar\orca\workspaces\agent os" || exit /b 1
set "AGENTOS_PORT=4200"
node --env-file-if-exists=.env server/index.mjs
