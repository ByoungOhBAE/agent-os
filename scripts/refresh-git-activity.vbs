' Hidden launcher for the 「커밋·푸시」 data refresh (Windows scheduled task "AgentOS\GitActivityRefresh", every 5 min).
' Register:   schtasks /Create /TN "AgentOS\GitActivityRefresh" /SC MINUTE /MO 5 /TR "wscript.exe //B //Nologo \"<this file>\"" /F
' Remove:     schtasks /Delete /TN "AgentOS\GitActivityRefresh" /F
Set sh = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """C:\Program Files\nodejs\node.exe"" """ & here & "\refresh-git-activity.mjs""", 0, False
