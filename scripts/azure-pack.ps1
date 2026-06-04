# Собирает frontend и упаковывает backend для ZIP Deploy в Azure.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "Building frontend..."
Push-Location (Join-Path $root "frontend")
if (-not (Test-Path "node_modules")) { npm ci }
npm run build
Pop-Location

Write-Host "Packing backend..."
$backend = Join-Path $root "backend"
$zipPath = Join-Path $root "azure-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$staging = Join-Path $env:TEMP "ferma-azure-pack"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item -Path (Join-Path $backend "*") -Destination $staging -Recurse -Exclude @("node_modules", ".env")
if (Test-Path (Join-Path $backend "node_modules")) {
  Write-Host "Copying node_modules (may take a minute)..."
  Copy-Item (Join-Path $backend "node_modules") (Join-Path $staging "node_modules") -Recurse
}

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force

Write-Host "Done: $zipPath"
Write-Host "Upload in Azure Portal: Web App -> Deployment Center -> ZIP Deploy"
