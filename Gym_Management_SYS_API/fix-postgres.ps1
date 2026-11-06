# PostgreSQL Password Reset Helper Script
# Run as Administrator: powershell -ExecutionPolicy Bypass -File fix-postgres.ps1

Write-Host "`n🔧 PostgreSQL Password Reset Helper`n" -ForegroundColor Cyan

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script must be run as Administrator!`n" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'`n"
    pause
    exit
}

Write-Host "✅ Running as Administrator`n" -ForegroundColor Green

# Find PostgreSQL installation
Write-Host "🔍 Looking for PostgreSQL installation...`n"
$pgPaths = @(
    "C:\Program Files\PostgreSQL\14",
    "C:\Program Files\PostgreSQL\15",
    "C:\Program Files\PostgreSQL\16",
    "C:\Program Files\PostgreSQL\13"
)

$pgPath = $null
foreach ($path in $pgPaths) {
    if (Test-Path $path) {
        $pgPath = $path
        Write-Host "✅ Found PostgreSQL at: $pgPath`n" -ForegroundColor Green
        break
    }
}

if (-not $pgPath) {
    Write-Host "❌ PostgreSQL not found in standard locations`n" -ForegroundColor Red
    Write-Host "Please specify the path manually or install PostgreSQL`n"
    pause
    exit
}

$pgVersion = Split-Path $pgPath -Leaf
$hbaPath = "$pgPath\data\pg_hba.conf"
$serviceName = "postgresql-x64-$pgVersion"

Write-Host "📝 Configuration:`n"
Write-Host "   PostgreSQL Version: $pgVersion"
Write-Host "   Config File: $hbaPath"
Write-Host "   Service Name: $serviceName`n"

# Check if service exists
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "❌ Service '$serviceName' not found`n" -ForegroundColor Red
    Write-Host "Available PostgreSQL services:`n"
    Get-Service -Name "postgresql*" | Format-Table Name, Status
    pause
    exit
}

Write-Host "✅ Service found: $($service.Status)`n" -ForegroundColor Green

# Backup pg_hba.conf
Write-Host "💾 Creating backup of pg_hba.conf...`n"
$backupPath = "$hbaPath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $hbaPath $backupPath
Write-Host "✅ Backup created: $backupPath`n" -ForegroundColor Green

# Modify pg_hba.conf to trust mode
Write-Host "🔧 Modifying pg_hba.conf to trust mode...`n"
$content = Get-Content $hbaPath
$newContent = $content -replace 'scram-sha-256', 'trust' -replace 'md5', 'trust'
$newContent | Set-Content $hbaPath
Write-Host "✅ Configuration updated`n" -ForegroundColor Green

# Restart service
Write-Host "🔄 Restarting PostgreSQL service...`n"
Restart-Service $serviceName
Start-Sleep -Seconds 3
Write-Host "✅ Service restarted`n" -ForegroundColor Green

# Set password
Write-Host "🔐 Setting new password...`n"
$newPassword = "admin123"
$psqlPath = "$pgPath\bin\psql.exe"

$query = "ALTER USER postgres PASSWORD '$newPassword';"
& $psqlPath -U postgres -d postgres -c $query

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Password set to: $newPassword`n" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to set password`n" -ForegroundColor Red
}

# Restore pg_hba.conf
Write-Host "🔧 Restoring pg_hba.conf security...`n"
Copy-Item $backupPath $hbaPath
Write-Host "✅ Security restored`n" -ForegroundColor Green

# Restart service again
Write-Host "🔄 Restarting PostgreSQL service...`n"
Restart-Service $serviceName
Start-Sleep -Seconds 3
Write-Host "✅ Service restarted`n" -ForegroundColor Green

# Update .env file
Write-Host "📝 Updating .env file...`n"
$envPath = "$(Get-Location)\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath
    $envContent = $envContent -replace 'DB_PASSWORD=.*', "DB_PASSWORD=$newPassword"
    $envContent | Set-Content $envPath
    Write-Host "✅ .env file updated`n" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env file not found at: $envPath`n" -ForegroundColor Yellow
    Write-Host "   Please manually update DB_PASSWORD to: $newPassword`n"
}

Write-Host "`n🎉 PostgreSQL password has been reset!`n" -ForegroundColor Green
Write-Host "📝 Summary:`n"
Write-Host "   Username: postgres"
Write-Host "   Password: $newPassword"
Write-Host "   Database: ironforge_gym`n"

Write-Host "✅ Next steps:`n"
Write-Host "   1. Run: npm run test-db"
Write-Host "   2. Run: npm run migrate"
Write-Host "   3. Run: npm run seed"
Write-Host "   4. Run: npm run dev`n"

pause
