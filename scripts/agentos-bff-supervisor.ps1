# AgentOS BFF supervisor: keeps the loopback BFF (port 4200) running and logs every start/exit.
# Started hidden by scripts\start-agentos-bff.cmd (Startup AgentOS-Paperclip.vbs, desktop shortcut).
# - one supervisor per user session (named mutex); a second launch exits immediately
# - if a healthy BFF already answers on the port (started by hand), it waits instead of spawning a twin
# - restarts the server after any exit with capped backoff; log: %LOCALAPPDATA%\agentos\logs\bff-YYYYMMDD.log
$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$port    = 4200
$health  = "http://127.0.0.1:$port/api/hermes/profiles"
$logDir  = Join-Path $env:LOCALAPPDATA 'agentos\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function LogFile { Join-Path $logDir ("bff-{0}.log" -f (Get-Date -Format 'yyyyMMdd')) }
function Write-Log([string]$msg) {
  $line = "{0} [supervisor pid={1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $PID, $msg
  for ($i = 0; $i -lt 5; $i++) {
    try { [IO.File]::AppendAllText((LogFile), $line + "`r`n", [Text.Encoding]::UTF8); return } catch { Start-Sleep -Milliseconds 200 }
  }
}
function Test-Healthy {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $health).StatusCode -eq 200 } catch { return $false }
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\AgentOS-BFF-Supervisor', [ref]$created)
if (-not $created) { exit 0 }

Write-Log "start (root=$root port=$port)"
$backoff = 5
try {
  while ($true) {
    if (Test-Healthy) {
      # Someone else (manual run) already serves the port: watch it instead of fighting for the port.
      Start-Sleep -Seconds 15
      continue
    }
    $log = LogFile
    Write-Log "launching server"
    $started = Get-Date
    $env:AGENTOS_PORT = "$port"
    $cmd = "node --env-file-if-exists=.env server/index.mjs >> `"$log`" 2>&1"
    $proc = Start-Process -FilePath "$env:WINDIR\System32\cmd.exe" -ArgumentList '/d', '/s', '/c', "`"$cmd`"" `
      -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $proc.WaitForExit()
    $ran = [int]((Get-Date) - $started).TotalSeconds
    Write-Log ("server exited code={0} after {1}s" -f $proc.ExitCode, $ran)
    if ($ran -ge 120) { $backoff = 5 } else { $backoff = [Math]::Min($backoff * 2, 60) }
    Write-Log "restarting in ${backoff}s"
    Start-Sleep -Seconds $backoff
  }
} finally {
  Write-Log "stop"
  $mutex.ReleaseMutex()
}
