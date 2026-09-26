# One-click launcher for the local Paperclip dashboard and AgentOS read-only plugin.
# Safe to run repeatedly: reuse healthy services rather than starting duplicates.
param([string]$Page = '/HER/hermes')
$ErrorActionPreference = 'Stop'
$paperclip = 'http://127.0.0.1:3100'
if ($Page -notmatch '^/[A-Za-z0-9/_-]*$') { throw "Invalid page path: $Page" }
$dashboard = "$paperclip$Page"
$bff = 'http://127.0.0.1:4200/api/hermes/profiles'
$root = Split-Path -Parent $PSScriptRoot

function Test-Http([string]$url) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

try {
    if (-not (Test-Http "$paperclip/api/health")) {
        Write-Host 'Starting Paperclip...'
        # Only one keepalive per WSL distro; an already-running distro may merely have a stopped service.
        & "$env:WINDIR\System32\wsl.exe" -d Ubuntu -- pgrep -f '^sleep infinity$' *> $null
        if ($LASTEXITCODE -ne 0) {
            Start-Process -FilePath "$env:WINDIR\System32\cmd.exe" -ArgumentList ('/c "' + (Join-Path $root 'scripts\keep-paperclip-wsl.cmd') + '"') -WindowStyle Hidden | Out-Null
        }
        & "$env:WINDIR\System32\wsl.exe" -d Ubuntu -- systemctl --user start paperclipai
        if ($LASTEXITCODE -ne 0) { throw 'Could not start paperclipai.service in WSL Ubuntu.' }
    }

    if (-not (Test-Http $bff)) {
        Write-Host 'Starting AgentOS bridge...'
        Start-Process -FilePath "$env:WINDIR\System32\cmd.exe" -ArgumentList ('/c "' + (Join-Path $root 'scripts\start-agentos-bff.cmd') + '"') -WindowStyle Hidden | Out-Null
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if ((Test-Http "$paperclip/api/health") -and (Test-Http $dashboard) -and (Test-Http $bff)) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Paperclip, plugin, or AgentOS bridge did not become ready within 90 seconds.' }
    Write-Host 'Opening dashboard.'
    Start-Process $dashboard | Out-Null
} catch {
    $message = "Cannot open the dashboard.`n$($_.Exception.Message)`n`nCheck WSL Ubuntu, paperclipai.service, and ports 3100/4200."
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message, 'Paperclip startup error', 'OK', 'Error') | Out-Null
    exit 1
}
