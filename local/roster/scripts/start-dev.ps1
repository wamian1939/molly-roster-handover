param(
  [switch]$Install,
  [switch]$Migrate,
  [switch]$SkipMultiAgent
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $workspace "backend"
$logDirectory = Join-Path $workspace ".dev-logs"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Assert-NativeSuccess([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" }
}

function Get-Readiness {
  $result = [ordered]@{ Backend = $false; Database = $false; Evaluate = $false; Frontend = $false }
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:4020/api/health" -TimeoutSec 2
    $result.Backend = $true
    $result.Database = $health.services.database -eq $true
    $result.Evaluate = $health.services.evaluateMolly -eq $true
  } catch {}
  try {
    $frontendResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5176" -UseBasicParsing -TimeoutSec 2
    $result.Frontend = $frontendResponse.StatusCode -eq 200
  } catch {}
  return [pscustomobject]$result
}

if ($Install) {
  & npm install --prefix $workspace
  Assert-NativeSuccess "Frontend dependency installation"
  & npm install --prefix $backend
  Assert-NativeSuccess "Backend dependency installation"
}

& docker compose --project-directory $workspace up -d postgres
Assert-NativeSuccess "PostgreSQL startup"

if ($Migrate) {
  Push-Location $backend
  try {
    & npm run prisma:migrate:deploy
    Assert-NativeSuccess "Prisma migration deployment"
    & npm run prisma:seed
    Assert-NativeSuccess "Prisma seed"
  } finally {
    Pop-Location
  }
}

if (-not (Test-Port 4020)) {
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory $backend -RedirectStandardOutput (Join-Path $logDirectory "backend.log") -RedirectStandardError (Join-Path $logDirectory "backend.err.log") -WindowStyle Hidden
}

if (-not (Test-Port 5176)) {
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory $workspace -RedirectStandardOutput (Join-Path $logDirectory "frontend.log") -RedirectStandardError (Join-Path $logDirectory "frontend.err.log") -WindowStyle Hidden
}

if (-not $SkipMultiAgent -and -not (Test-Port 4191)) {
  $agentStart = Join-Path $workspace "multi-agent-engine\scripts\start.ps1"
  & powershell -ExecutionPolicy Bypass -File $agentStart
  Assert-NativeSuccess "Multi-Agent engine startup"
}

$ready = $false
$lastReadiness = $null
for ($attempt = 1; $attempt -le 45; $attempt++) {
  $lastReadiness = Get-Readiness
  if ($lastReadiness.Backend -and $lastReadiness.Database -and $lastReadiness.Evaluate -and $lastReadiness.Frontend) { $ready = $true; break }
  Write-Host "WAITING ($attempt/45): backend=$($lastReadiness.Backend) database=$($lastReadiness.Database) evaluate=$($lastReadiness.Evaluate) frontend=$($lastReadiness.Frontend)"
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Error "UNHEALTHY: Molly Roster did not become ready. backend=$($lastReadiness.Backend) database=$($lastReadiness.Database) evaluate=$($lastReadiness.Evaluate) frontend=$($lastReadiness.Frontend). Review .dev-logs before retrying."
  exit 1
}

Write-Host "READY: Molly Roster frontend: http://127.0.0.1:5176"
Write-Host "READY: Molly Roster health:   http://127.0.0.1:4020/api/health"
Write-Host "READY: Evaluate Molly API:    http://127.0.0.1:4000/api"

