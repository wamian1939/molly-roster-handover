param(
  [switch]$Install,
  [switch]$Migrate
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Ensure-File($path, $examplePath) {
  if (-not (Test-Path $path) -and (Test-Path $examplePath)) {
    Copy-Item $examplePath $path
    Write-Host "Created $path from $examplePath" -ForegroundColor Yellow
  }
}

function Test-Port($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

Write-Host "Evaluate Molly dev starter" -ForegroundColor Green

Ensure-File (Join-Path $root ".env") (Join-Path $root ".env.example")
Ensure-File (Join-Path $backend ".env") (Join-Path $backend ".env.example")

if ($Install) {
  Write-Step "Installing root dependencies"
  Push-Location $root
  npm install
  Pop-Location

  Write-Step "Installing backend dependencies"
  Push-Location $backend
  npm install
  Pop-Location
}

Write-Step "Generating Prisma client"
Push-Location $backend
npm run prisma:generate

if ($Migrate) {
  Write-Step "Applying Prisma migrations"
  npx prisma migrate deploy --schema prisma/schema.prisma
}
Pop-Location

if (Test-Port 4000) {
  Write-Host "Backend port 4000 is already in use. Keeping the existing process." -ForegroundColor Yellow
} else {
  Write-Step "Starting backend on http://127.0.0.1:4000"
  Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "cd '$backend'; npm run dev"
  ) -WindowStyle Hidden
}

if (Test-Port 5174) {
  Write-Host "Frontend port 5174 is already in use. Keeping the existing process." -ForegroundColor Yellow
} else {
  Write-Step "Starting frontend on http://127.0.0.1:5174"
  Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "cd '$root'; npm run dev"
  ) -WindowStyle Hidden
}

Write-Host ""
Write-Host "Done. Open http://127.0.0.1:5174" -ForegroundColor Green
Write-Host "Backend health: http://127.0.0.1:4000/api/health"
Write-Host ""
Write-Host "Options:"
Write-Host "  .\scripts\start-dev.ps1 -Install   # install dependencies first"
Write-Host "  .\scripts\start-dev.ps1 -Migrate   # apply database migrations first"
