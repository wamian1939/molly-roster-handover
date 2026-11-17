[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspace "backend"
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-acceptance.json"
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.schema -notmatch '^codex_browser_acceptance_[0-9]+$') {
  throw "Production smoke requires a validated isolated acceptance schema."
}

$env:DATABASE_URL = $state.isolatedUrl
$env:NODE_ENV = "production"
$env:PORT = "4011"
$env:APP_ORIGIN = "http://127.0.0.1:4011"
$stdout = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-production-smoke.out.log"
$stderr = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-production-smoke.err.log"
$process = Start-Process -FilePath "node.exe" -ArgumentList @("dist/server.js") -WorkingDirectory $backendPath -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:4011/api/health"
      if ($health.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { throw "Production smoke server did not become healthy." }

  $deepLink = Invoke-WebRequest -UseBasicParsing -Headers @{ Accept = "text/html" } "http://127.0.0.1:4011/evaluation-rounds/smoke-round"
  try { Invoke-WebRequest -UseBasicParsing -Headers @{ Accept = "text/html" } "http://127.0.0.1:4011/api/not-real" | Out-Null } catch { $unknownApiStatus = [int]$_.Exception.Response.StatusCode }
  $bundleHasLocalhost = Select-String -Path (Join-Path $workspace "dist/assets/*.js") -Pattern "127.0.0.1:4000|localhost:4000" -Quiet
  [pscustomobject]@{
    health = $health.StatusCode
    deepLink = $deepLink.StatusCode
    unknownApiRejected = $unknownApiStatus -in 401, 404
    unknownApiStatus = $unknownApiStatus
    xPoweredByAbsent = -not $health.Headers.ContainsKey("X-Powered-By")
    helmetNoSniff = $health.Headers["X-Content-Type-Options"] -eq "nosniff"
    productionBundleHasLocalhostApi = $bundleHasLocalhost
  } | ConvertTo-Json -Compress
} finally {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
