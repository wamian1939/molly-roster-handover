$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$evaluateBackend = Join-Path (Split-Path -Parent $workspace) "Evaluate Molly\backend"
$rosterBackend = Join-Path $workspace "backend"

$expected = @(
  @{ Port = 4010; Path = (Join-Path $evaluateBackend "node_modules\tsx\dist\preflight.cjs"); Marker = "src/server.ts" },
  @{ Port = 4035; Path = (Join-Path $rosterBackend "node_modules\tsx\dist\preflight.cjs"); Marker = "src/server.ts" },
  @{ Port = 5177; Path = (Join-Path $workspace "node_modules"); Marker = "--port 5177" }
)

$targets = @()
foreach ($service in $expected) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue)
  foreach ($processId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    $command = $process.CommandLine
    if (-not $process -or -not $command -or -not $command.Contains($service.Path) -or
      -not $command.Contains($service.Marker)) {
      throw "Port $($service.Port) is not the expected disposable QA process; nothing was stopped"
    }
    $targets += [pscustomobject]@{ Port = $service.Port; ProcessId = $processId; Command = $command }
  }
}

foreach ($target in $targets) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($target.ProcessId)" -ErrorAction SilentlyContinue
  if (-not $process -or $process.CommandLine -ne $target.Command) {
    throw "QA process identity changed on port $($target.Port); stopping aborted"
  }
  Stop-Process -Id $target.ProcessId -Force
  Write-Output "Stopped disposable QA listener port=$($target.Port) pid=$($target.ProcessId)"
}

$remaining = @()
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  $remaining = @(Get-NetTCPConnection -State Listen -LocalPort 4010,4035,5177 -ErrorAction SilentlyContinue)
  if (-not $remaining.Count) { break }
  Start-Sleep -Milliseconds 200
}
if ($remaining.Count) { throw "One or more disposable QA listeners remain; inspect exact PIDs before cleanup" }
Write-Output "Disposable QA ports are clear. Process ancestors and unrelated services were not targeted."
