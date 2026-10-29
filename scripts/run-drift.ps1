$ErrorActionPreference = 'Stop'

# Fetch direct unpooled connection string for migration-test branch
$branchCs = (neon connection-string migration-test --database-name neondb --pooled false).Trim()
$env:BRANCH = $branchCs
$env:FRESH  = $env:BRANCH -replace '/neondb\?', '/nstp_fresh_test?'

Write-Host "Host:        " ([uri]$env:BRANCH).Host
Write-Host "Fresh Path:  " ([uri]$env:FRESH).AbsolutePath

if (([uri]$env:BRANCH).Host -match 'pooler') {
    throw "Safety check failed: Host contains 'pooler'."
}
if (([uri]$env:BRANCH).Host -match 'ep-long-truth-a1cnk55w') {
    throw "Safety check failed: Host is ep-long-truth-a1cnk55w (production)."
}
if (([uri]$env:FRESH).AbsolutePath -ne '/nstp_fresh_test') {
    throw "Safety check failed: Fresh database is not /nstp_fresh_test."
}

Set-Location -Path "$PSScriptRoot/../backend"
npx prisma migrate diff --from-url $env:BRANCH --to-url $env:FRESH --script | Out-File -FilePath drift.sql -Encoding utf8

Write-Host "Successfully generated drift.sql at backend/drift.sql"
