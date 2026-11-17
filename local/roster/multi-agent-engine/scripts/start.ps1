$ErrorActionPreference = 'Stop'
$engineRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $engineRoot '..\scheduling-engine\.venv-isolated\Scripts\python.exe'
foreach ($envFile in @((Join-Path $engineRoot '..\scheduling-engine\.env'), (Join-Path $engineRoot '.env'))) {
  if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
      if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"').Trim("'"), 'Process')
      }
    }
  }
}
if (Get-NetTCPConnection -State Listen -LocalPort 4191 -ErrorAction SilentlyContinue) { throw 'Port 4191 is occupied; inspect the existing process first.' }
$dataDir = Join-Path $engineRoot '.data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$process = Start-Process -FilePath $python -ArgumentList '-m','uvicorn','multi_agent.api:app','--host','127.0.0.1','--port','4191' -WorkingDirectory $engineRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'server.out.log') -RedirectStandardError (Join-Path $dataDir 'server.err.log')
Set-Content -LiteralPath (Join-Path $dataDir 'server.pid') -Value $process.Id
for ($attempt=0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 300
  try {
    if ((Invoke-RestMethod 'http://127.0.0.1:4191/multi-api/health' -TimeoutSec 2).ok) {
      Write-Host 'Multi-Agent Lab: http://127.0.0.1:4191/'; exit 0
    }
  } catch { }
}
throw 'Multi-Agent Lab failed to start. Read .data/server.err.log.'
