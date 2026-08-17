$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host "Created .env from .env.example."
  Write-Host "Set GEMINI_API_KEY in .env for a live run, or leave GEMINI_FAKE=1 to run entirely against the local stub."
}

if (-not (Test-Path 'node_modules')) {
  Write-Host "Installing dependencies..."
  npm install
}

Write-Host ""
Write-Host "Backend:  http://localhost:3001"
Write-Host "Frontend: http://localhost:5173"
Write-Host ""

npm run dev
