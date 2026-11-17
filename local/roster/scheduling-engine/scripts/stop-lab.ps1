$ErrorActionPreference = 'Stop'
$labRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $labRoot '.data\lab.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'Lab is not running.'; exit 0 }
$labPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $labPid" -ErrorAction SilentlyContinue
if ($process) {
  if ($process.ExecutablePath -notlike "$(Join-Path $labRoot '.venv-isolated')*") { throw "PID $labPid does not belong to Scheduling Engine Lab." }
}
$children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $labPid" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*-m uvicorn api.app:app --host 127.0.0.1 --port 4188*' })
foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
if ($process) { Stop-Process -Id $labPid -ErrorAction SilentlyContinue }
for ($attempt=0; $attempt -lt 20; $attempt++) {
  if (-not (Get-NetTCPConnection -State Listen -LocalPort 4188 -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 100
}
if (Get-NetTCPConnection -State Listen -LocalPort 4188 -ErrorAction SilentlyContinue) {
  throw 'Port 4188 is still listening; inspect its owner before clearing the Lab PID file.'
}
Remove-Item -LiteralPath $pidFile
Write-Host 'Scheduling Engine Lab stopped.'
