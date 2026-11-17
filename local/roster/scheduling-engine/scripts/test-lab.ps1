param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$labRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $labRoot
$python = Join-Path $labRoot '.venv-isolated\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
  if ($SkipInstall) { throw 'Isolated Python environment is missing.' }
  python -m venv (Join-Path $labRoot '.venv-isolated')
}
if (-not $SkipInstall) { & $python -m pip install --disable-pip-version-check -r (Join-Path $labRoot 'requirements.txt'); if ($LASTEXITCODE -ne 0) { throw 'Python dependency install failed.' } }
& $python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Engine tests failed.' }
$ui = Join-Path $labRoot 'lab-ui'
Push-Location -LiteralPath $ui
try {
  if (-not $SkipInstall -or -not (Test-Path -LiteralPath 'node_modules')) { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'UI dependency install failed.' } }
  npm run test:comparison
  if ($LASTEXITCODE -ne 0) { throw 'UI comparison tests failed.' }
  npm run test:time
  if ($LASTEXITCODE -ne 0) { throw 'UI local time tests failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'UI build failed.' }
} finally { Pop-Location }
Write-Host 'Scheduling Engine Lab tests and UI build passed.'
