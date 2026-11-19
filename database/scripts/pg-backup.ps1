# Logical backup on Windows. Needs PostgreSQL 17 client tools (pg_dump) — the embedded server used
# for local development does not include them. Install "Command Line Tools" from the official
# PostgreSQL Windows installer, or set $env:PG_BIN to their folder.
#
#   $env:PGPASSWORD = '<app db password>'   # or use %APPDATA%\postgresql\pgpass.conf
#   .\pg-backup.ps1 [-Database interviewos] [-OutDir "$env:LOCALAPPDATA\InterviewOS\backups"]
param(
  [string]$Database = "interviewos",
  [string]$User = "interviewos_app",
  [string]$OutDir = (Join-Path $env:LOCALAPPDATA "InterviewOS\backups"),
  [int]$RetentionDays = 14
)
$ErrorActionPreference = "Stop"
$pgDump = if ($env:PG_BIN) { Join-Path $env:PG_BIN "pg_dump.exe" } else { (Get-Command pg_dump -ErrorAction SilentlyContinue).Source }
if (-not $pgDump -or -not (Test-Path $pgDump)) { throw "pg_dump not found. Install PostgreSQL 17 command line tools or set PG_BIN." }

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$out = Join-Path $OutDir "${Database}_$stamp.dump"
& $pgDump -h 127.0.0.1 -U $User -d $Database -Fc --no-owner -f $out
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed ($LASTEXITCODE)" }
(Get-FileHash $out -Algorithm SHA256).Hash | Out-File -Encoding ascii "$out.sha256"
Write-Host "Backup written: $out"

Get-ChildItem $OutDir -Filter "${Database}_*.dump*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | Remove-Item
