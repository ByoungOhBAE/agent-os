# Create a desktop shortcut in the real Windows Desktop folder (including OneDrive redirection).
param(
    [string]$Name = 'AgentOS',
    [string]$Page = '/HER/dashboard'
)
$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
if (-not (Test-Path -LiteralPath $desktop)) { throw "Desktop folder missing: $desktop" }
$repo = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'open-paperclip-dashboard.ps1'
if (-not (Test-Path -LiteralPath $launcher)) { throw "Launcher missing: $launcher" }
$icon = Join-Path $PSScriptRoot 'assets\agentos.ico'
if (-not (Test-Path -LiteralPath $icon)) { $icon = "$env:WINDIR\System32\shell32.dll,14" } else { $icon = "$icon,0" }
$shortcutPath = Join-Path $desktop "$Name.lnk"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcutPath)
$link.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '" -Page "' + $Page + '"'
$link.WorkingDirectory = $repo
$link.Description = 'AgentOS: Paperclip 서비스 시작 후 대시보드 열기'
$link.IconLocation = $icon
$link.WindowStyle = 7
$link.Save()
$check = $shell.CreateShortcut($shortcutPath)
if ($check.TargetPath -ne $link.TargetPath -or $check.Arguments -ne $link.Arguments) { throw 'Shortcut verification failed' }
Write-Output "shortcut=$shortcutPath"
Write-Output "arguments=$($check.Arguments)"
Write-Output "icon=$($check.IconLocation)"
