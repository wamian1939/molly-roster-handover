[CmdletBinding()]
param([switch]$BackendOnly)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspace "backend"
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-acceptance.json"
$backendOut = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-backend.out.log"
$backendErr = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-backend.err.log"
$frontendOut = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-frontend.out.log"
$frontendErr = Join-Path ([System.IO.Path]::GetTempPath()) "evaluate-molly-browser-frontend.err.log"

if (-not (Test-Path -LiteralPath $statePath)) {
  throw "Browser acceptance state file is missing. Run the prepare script first."
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.schema -notmatch '^codex_browser_acceptance_[0-9]+$') {
  throw "Unsafe browser acceptance schema name."
}

$env:DATABASE_URL = $state.isolatedUrl
$env:PORT = "4010"
$env:CORS_ORIGIN = "http://127.0.0.1:5175"
$backend = Start-Process -FilePath "npx.cmd" -ArgumentList @("tsx", "src/server.ts") -WorkingDirectory $backendPath -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru

if (-not $BackendOnly) {
  $env:VITE_API_BASE_URL = "http://127.0.0.1:4010/api"
  $frontend = Start-Process -FilePath "npx.cmd" -ArgumentList @("vite", "--host", "127.0.0.1", "--port", "5175", "--strictPort") -WorkingDirectory $workspace -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -WindowStyle Hidden -PassThru
}

[pscustomobject]@{
  BackendPid = $backend.Id
  FrontendPid = if ($frontend) { $frontend.Id } else { $null }
  BackendOut = $backendOut
  BackendErr = $backendErr
  FrontendOut = $frontendOut
  FrontendErr = $frontendErr
} | ConvertTo-Json -Compress
