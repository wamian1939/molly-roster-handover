$ErrorActionPreference = 'Stop'
$labRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $labRoot '.venv-isolated\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run scripts/test-lab.ps1 first.' }
$envFile = Join-Path $labRoot '.env'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"').Trim("'"), 'Process')
    }
  }
}
Remove-Item Env:ROSTER_DATABASE_URL -ErrorAction SilentlyContinue
$dataDir = Join-Path $labRoot '.data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$pidFile = Join-Path $dataDir 'lab.pid'
if (Test-Path -LiteralPath $pidFile) {
  $oldPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { throw "Lab process $oldPid is already running." }
}
if (Get-NetTCPConnection -State Listen -LocalPort 4188 -ErrorAction SilentlyContinue) {
  throw 'Port 4188 is already listening. Stop or inspect that service before starting the Lab.'
}
$process = Start-Process -FilePath $python -ArgumentList '-m','uvicorn','api.app:app','--host','127.0.0.1','--port','4188' -WorkingDirectory $labRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'lab.out.log') -RedirectStandardError (Join-Path $dataDir 'lab.err.log')
Set-Content -LiteralPath $pidFile -Value $process.Id
for ($attempt=0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 300
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4188/api/health' -TimeoutSec 2
    if ($health.ok) { Write-Host "Lab running at http://127.0.0.1:4188/ (PID $($process.Id))"; exit 0 }
  } catch { }
}
throw 'Lab did not pass its health check.'
