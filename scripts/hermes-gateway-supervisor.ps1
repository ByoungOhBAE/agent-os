# Hermes gateway supervisor (T65): keeps the multiplexed Hermes gateway (port 8645, every bot) running.
# Started hidden at logon by Startup\AgentOS-Gateway-Supervisor.vbs. Hermes' own Startup launcher
# (Hermes_Gateway.vbs) stays in place; this supervisor only ADOPTS whatever gateway is running and relaunches
# it through Hermes' own launcher (gateway-service\Hermes_Gateway.vbs) when it died for a reason that asks for a
# restart. It never starts a second gateway while one is alive.
#
# Decision after the gateway is gone (state\gateway.lifecycle.json written by Hermes):
#   phase=exited exit_code=0   -> planned stop (hermes gateway stop): stay down, keep watching
#   phase=exited exit_code=78  -> fatal config error: stay down, keep watching (restarting would loop)
#   phase=exited other code    -> restart (75 = watchdog "please restart", 1 = crash, ...)
#   phase=running, pid dead    -> killed / hard crash: restart
#   file missing / unreadable  -> restart
# Pause on purpose: create %LOCALAPPDATA%\agentos\gateway-supervisor.pause (no relaunch while it exists).
# Log: %LOCALAPPDATA%\agentos\logs\gateway-supervisor-YYYYMMDD.log
# Self test of the decision table (no side effects): powershell -File hermes-gateway-supervisor.ps1 -SelfTest
param([switch]$SelfTest, [int]$StartDelaySec = 30)
$ErrorActionPreference = 'Stop'

$hermesHome = Join-Path $env:LOCALAPPDATA 'hermes'
$launcher   = Join-Path $hermesHome 'gateway-service\Hermes_Gateway.vbs'
$pidFile    = Join-Path $hermesHome 'gateway.pid'
$lifeFile   = Join-Path $hermesHome 'state\gateway.lifecycle.json'
$pauseFile  = Join-Path $env:LOCALAPPDATA 'agentos\gateway-supervisor.pause'
$logDir     = Join-Path $env:LOCALAPPDATA 'agentos\logs'

function Get-RestartDecision([object]$life, [bool]$pidAlive) {
  # returns 'adopt' | 'restart' | 'stay-down-planned' | 'stay-down-fatal'
  if ($pidAlive) { return 'adopt' }
  if ($null -eq $life) { return 'restart' }
  if ($life.phase -eq 'exited') {
    $code = $life.exit_code
    if ($code -eq 0)  { return 'stay-down-planned' }
    if ($code -eq 78) { return 'stay-down-fatal' }
    return 'restart'
  }
  return 'restart'
}

if ($SelfTest) {
  $cases = @(
    @{ life = $null; alive = $true; want = 'adopt' },
    @{ life = [pscustomobject]@{ phase = 'running'; pid = 1 }; alive = $false; want = 'restart' },
    @{ life = [pscustomobject]@{ phase = 'exited'; exit_code = 75 }; alive = $false; want = 'restart' },
    @{ life = [pscustomobject]@{ phase = 'exited'; exit_code = 1 }; alive = $false; want = 'restart' },
    @{ life = [pscustomobject]@{ phase = 'exited'; exit_code = 0 }; alive = $false; want = 'stay-down-planned' },
    @{ life = [pscustomobject]@{ phase = 'exited'; exit_code = 78 }; alive = $false; want = 'stay-down-fatal' },
    @{ life = $null; alive = $false; want = 'restart' }
  )
  $bad = 0
  foreach ($c in $cases) {
    $got = Get-RestartDecision $c.life $c.alive
    $ok = ($got -eq $c.want); if (-not $ok) { $bad++ }
    '{0} life={1} alive={2} -> {3} (want {4})' -f ($(if ($ok) { 'ok  ' } else { 'FAIL' })), ($c.life | ConvertTo-Json -Compress), $c.alive, $got, $c.want
  }
  if ($bad) { 'SELFTEST_FAIL'; exit 1 } else { 'SELFTEST_OK'; exit 0 }
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
function LogFile { Join-Path $logDir ("gateway-supervisor-{0}.log" -f (Get-Date -Format 'yyyyMMdd')) }
function Write-Log([string]$msg) {
  $line = "{0} [pid={1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $PID, $msg
  for ($i = 0; $i -lt 5; $i++) {
    try { [IO.File]::AppendAllText((LogFile), $line + "`r`n", [Text.Encoding]::UTF8); return } catch { Start-Sleep -Milliseconds 200 }
  }
}
function Read-Json([string]$path) {
  try { if (Test-Path $path) { return (Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json) } } catch { }
  return $null
}
function Get-GatewayPid {
  # the pid in gateway.pid, but only if that process is alive AND is a Hermes gateway (pids get reused).
  # W1-X1: pid file missing/stale while a gateway still serves 8645 -> adopt the process that owns the port,
  # so a live gateway never gets a second launch.
  $info = Read-Json $pidFile
  if ($info -and $info.pid) {
    try {
      $p = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f [int]$info.pid)
      if ($p -and $p.CommandLine -match 'gateway\s+run') { return [int]$info.pid }
    } catch { }
  }
  try {
    $owner = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8645 -State Listen -ErrorAction Stop | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($owner) {
      $p = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f [int]$owner)
      if ($p -and $p.CommandLine -match 'gateway\s+run') { return [int]$owner }
    }
  } catch { }
  return $null
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\AgentOS-Hermes-Gateway-Supervisor', [ref]$created)
if (-not $created) { exit 0 }

# No runtime plugin installs inside the gateway (T64); the config says the same, this covers profiles without one.
$env:HERMES_DISABLE_LAZY_INSTALLS = '1'
Write-Log "start (launcher=$launcher delay=${StartDelaySec}s)"
Start-Sleep -Seconds $StartDelaySec   # at logon Hermes' own Startup launcher goes first; adopt instead of racing it

$backoff = 5
$adopted = $null
$lastState = ''
try {
  while ($true) {
   try {
    $gw = Get-GatewayPid
    if ($gw) {
      if ($adopted -ne $gw) { Write-Log "watching gateway pid=$gw"; $adopted = $gw; $lastState = 'adopt' }
      $life = Read-Json $lifeFile
      if ($life -and $life.started_at) {
        $up = ((Get-Date).ToUniversalTime() - ([datetime]$life.started_at).ToUniversalTime()).TotalSeconds
        if ($up -ge 120) { $backoff = 5 }
      }
      Start-Sleep -Seconds 5
      continue
    }
    $life = Read-Json $lifeFile
    # review B: right after a manual restart the new gateway may be up (lifecycle pid alive) before gateway.pid and the
    # port are written -> wait, never decide 'restart' on a live process
    if ($life -and $life.pid) {
      $lp = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f [int]$life.pid) -ErrorAction SilentlyContinue
      if ($lp -and $lp.CommandLine -match 'gateway\s+run') { Start-Sleep -Seconds 5; continue }
    }
    $decision = Get-RestartDecision $life $false
    if ($adopted) {
      Write-Log ("gateway pid={0} gone: phase={1} exit_code={2} reason={3} -> {4}" -f $adopted, $life.phase, $life.exit_code, $life.exit_reason, $decision)
      $adopted = $null
    }
    if (Test-Path $pauseFile) {
      if ($lastState -ne 'paused') { Write-Log "pause file present, not relaunching"; $lastState = 'paused' }
      Start-Sleep -Seconds 10; continue
    }
    if ($decision -ne 'restart') {
      if ($lastState -ne $decision) { Write-Log "$decision, not relaunching (start the gateway by hand to resume watching)"; $lastState = $decision }
      Start-Sleep -Seconds 10; continue
    }
    Write-Log "relaunching in ${backoff}s"
    Start-Sleep -Seconds $backoff
    if (Get-GatewayPid) { continue }   # someone else started it meanwhile
    if (-not (Test-Path $launcher)) { Write-Log "launcher missing: $launcher"; Start-Sleep -Seconds 60; continue }
    Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList "`"$launcher`"" -WindowStyle Hidden | Out-Null
    $lastState = 'launched'
    Write-Log "launched via Hermes launcher"
    # wait up to 90s for the new gateway to register its pid before deciding again
    for ($i = 0; $i -lt 18 -and -not (Get-GatewayPid); $i++) { Start-Sleep -Seconds 5 }
    $backoff = [Math]::Min($backoff * 2, 60)
   } catch {
    # W1-X1: one unexpected error must not end the supervisor (nothing would restart it)
    Write-Log ("loop error: {0}" -f $_.Exception.Message)
    Start-Sleep -Seconds 10
   }
  }
} finally {
  Write-Log "stop"
  $mutex.ReleaseMutex()
}
