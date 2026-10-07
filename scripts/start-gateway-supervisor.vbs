' AgentOS: start the Hermes gateway supervisor hidden at logon (copied into the Startup folder).
' The supervisor adopts the gateway Hermes_Gateway.vbs starts and relaunches it after a crash (T65).
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\tahar\orca\workspaces\agent os\scripts\hermes-gateway-supervisor.ps1""", 0, False
