@echo off
rem Verification-only AgentOS BFF on port 4299, pointed at the isolated Paperclip verify instance (3199).
rem Uses the same .env (Hermes keys) so Hermes bot controls can be exercised; never used by production.
cd /d "C:\Users\tahar\orca\workspaces\agent os" || exit /b 1
set "AGENTOS_PORT=4299"
set "PAPERCLIP_API_URL=http://127.0.0.1:3199"
node --env-file-if-exists=.env server/index.mjs
