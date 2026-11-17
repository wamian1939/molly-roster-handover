param([switch]$InteractiveBrowser)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $workspace "backend"
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) "molly-roster-calendar-name-browser.json"
if (-not (Test-Path -LiteralPath $statePath)) { throw "Disposable Roster fixture is missing" }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.schema -notmatch '^codex_calendar_name_[0-9]+_[0-9a-f]{4}$') { throw "Unsafe schema name" }
$database = [uri]$state.isolatedUrl
if ($database.Host -notin @("127.0.0.1", "localhost") -or $database.Port -ne 5433 -or $database.AbsolutePath -ne "/molly_roster" -or $database.Query -notmatch [regex]::Escape("schema=$($state.schema)")) {
  throw "Fixture must target the disposable local Roster schema"
}
if (-not (Test-Path -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-acceptance.json"))) { throw "Disposable Evaluate fixture is missing" }
foreach ($port in @(4035, 5177)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "QA port $port is already in use" }
}
try {
  $evaluateHealth = Invoke-RestMethod -Uri "http://127.0.0.1:4010/api/health" -TimeoutSec 3
  if ($evaluateHealth.ok -ne $true) { throw "Temporary Evaluate API is not healthy" }
} catch { throw "Temporary Evaluate API on 4010 is unavailable" }
$env:DATABASE_URL = $state.isolatedUrl
$env:PORT = "4035"
$browserHost = if ($InteractiveBrowser) { "localhost" } else { "127.0.0.1" }
$browserOrigin = "http://${browserHost}:5177"
$env:CORS_ORIGIN = $browserOrigin
$env:APP_ORIGIN = $browserOrigin
$env:EVALUATE_API_BASE_URL = "http://127.0.0.1:4010/api"
$api = Start-Process -FilePath "npx.cmd" -ArgumentList @("tsx", "src/server.ts") -WorkingDirectory $backend -RedirectStandardOutput (Join-Path $env:TEMP "molly-roster-qa-4035.out.log") -RedirectStandardError (Join-Path $env:TEMP "molly-roster-qa-4035.err.log") -WindowStyle Hidden -PassThru
$env:VITE_API_BASE_URL = "http://${browserHost}:4035/api"
$front = Start-Process -FilePath "npx.cmd" -ArgumentList @("vite", "--host", $browserHost, "--port", "5177", "--strictPort") -WorkingDirectory $workspace -RedirectStandardOutput (Join-Path $env:TEMP "molly-roster-qa-5177.out.log") -RedirectStandardError (Join-Path $env:TEMP "molly-roster-qa-5177.err.log") -WindowStyle Hidden -PassThru
Write-Output "RosterQaApiPid=$($api.Id) FrontendPid=$($front.Id) BrowserUrl=$browserOrigin"
