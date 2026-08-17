Set-Location $PSScriptRoot

if (-not (Test-Path 'node_modules')) {
  Write-Host "Installing dependencies..."
  npm install
}

# Tests never call Gemini — the backend suite injects a stub client
# (fake-client.js) for every test, the same code path GEMINI_FAKE=1 uses
# at runtime. This run never burns quota, regardless of what's in .env.
npm test 2>&1 | Tee-Object -FilePath TEST-REPORT.txt
$status = $LASTEXITCODE

Write-Host ""
Write-Host "Full output written to TEST-REPORT.txt"
exit $status
