[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $workspace "backend"
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) "molly-roster-calendar-name-browser.json"
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.schema -notmatch '^codex_calendar_name_[0-9]+_[0-9a-f]{4}$') { throw "Unsafe QA schema" }
$url = [Uri]$state.isolatedUrl
if ($url.Host -notin @("127.0.0.1", "localhost") -or $url.Port -ne 5433 -or $url.AbsolutePath -ne "/molly_roster") { throw "Unsafe QA database URL" }
foreach ($port in @(4040, 5178)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "QA port $port is already in use" }
}
$env:DATABASE_URL = $state.isolatedUrl
$env:PORT = "4040"
$env:EVALUATE_API_BASE_URL = "http://127.0.0.1:4010/api"
$env:CORS_ORIGIN = "http://127.0.0.1:5178"
$env:APP_ORIGIN = "http://127.0.0.1:5178"
$temp = [System.IO.Path]::GetTempPath()
$api = Start-Process -FilePath "npx.cmd" -ArgumentList @("tsx", "src/server.ts") -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $temp "molly-roster-script-browser-api.out.log") -RedirectStandardError (Join-Path $temp "molly-roster-script-browser-api.err.log") -PassThru
$env:VITE_API_BASE_URL = "http://127.0.0.1:4040/api"
$front = Start-Process -FilePath "npx.cmd" -ArgumentList @("vite", "--host", "127.0.0.1", "--port", "5178", "--strictPort") -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $temp "molly-roster-script-browser-front.out.log") -RedirectStandardError (Join-Path $temp "molly-roster-script-browser-front.err.log") -PassThru
[pscustomobject]@{ ApiPid = $api.Id; FrontendPid = $front.Id; Schema = $state.schema } | ConvertTo-Json -Compress
