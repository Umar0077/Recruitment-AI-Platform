<#
.SYNOPSIS
    Starts the standalone InterviewOS Facial Expression V5 FastAPI service.
#>
[CmdletBinding()]
param(
    [switch]$Foreground,
    [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$ServiceRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ServiceRoot '.venv\Scripts\python.exe'
$EnvPath = Join-Path $ServiceRoot '.env'
$TmpDir = Join-Path $ServiceRoot 'tmp'
$PidPath = Join-Path $TmpDir 'v5-service.pid'
$LogOut = Join-Path $TmpDir 'v5-stdout.log'
$LogErr = Join-Path $TmpDir 'v5-stderr.log'

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment not found. Run .\scripts\setup-v5.ps1 first."
}

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    foreach ($rawLine in Get-Content $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }
        $name = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
            [Environment]::SetEnvironmentVariable($name, $val, 'Process')
        }
    }
}

Import-DotEnv $EnvPath

$HostAddr = [Environment]::GetEnvironmentVariable('V5_HOST', 'Process')
if (-not $HostAddr) { $HostAddr = '127.0.0.1' }
$PortStr = [Environment]::GetEnvironmentVariable('V5_PORT', 'Process')
$Port = if ($PortStr) { [int]$PortStr } else { 8765 }

$Token = [Environment]::GetEnvironmentVariable('V5_SERVICE_TOKEN', 'Process')
if (-not $Token -or $Token -eq 'replace-with-local-random-token') {
    throw "V5_SERVICE_TOKEN is missing or placeholder. Run .\scripts\setup-v5.ps1 or set V5_SERVICE_TOKEN in .env."
}

function Test-PortInUse([string]$TargetHost, [int]$TargetPort) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(400, $false)
        if ($connected -and $client.Connected) {
            $client.EndConnect($async)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

if (Test-PortInUse -TargetHost $HostAddr -TargetPort $Port) {
    throw "Port $Port on $HostAddr is already in use. Stop the existing process or set V5_PORT=8766 explicitly in .env."
}

if (-not (Test-Path $TmpDir)) {
    New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
}

$UvicornArgs = @('-m', 'uvicorn', 'app.main:app', '--host', $HostAddr, '--port', "$Port")

if ($Foreground) {
    Write-Host "[start-v5] Starting Facial Expression V5 in foreground on http://${HostAddr}:${Port}"
    Push-Location $ServiceRoot
    try {
        & $VenvPython @UvicornArgs
    } finally {
        Pop-Location
    }
    exit $LASTEXITCODE
}

Write-Host "[start-v5] Starting Facial Expression V5 background process on http://${HostAddr}:${Port}..."
$proc = Start-Process -FilePath $VenvPython `
    -ArgumentList $UvicornArgs `
    -WorkingDirectory $ServiceRoot `
    -RedirectStandardOutput $LogOut `
    -RedirectStandardError $LogErr `
    -WindowStyle Hidden `
    -PassThru

Set-Content -Path $PidPath -Value "$($proc.Id)" -Encoding ASCII

$readyUrl = "http://${HostAddr}:${Port}/api/v1/health/ready"
$liveUrl = "http://${HostAddr}:${Port}/api/v1/health/live"
$testerUrl = "http://${HostAddr}:${Port}/tester"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$isReady = $false
while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) {
        Write-Host "[start-v5] Service exited unexpectedly (exit code $($proc.ExitCode)). Check $LogErr"
        exit 1
    }
    try {
        $resp = Invoke-RestMethod -Uri $readyUrl -Method Get -TimeoutSec 2
        if ($resp.ready -eq $true) {
            $isReady = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 600
    }
}

if (-not $isReady) {
    Write-Host "[start-v5] Service did not report ready within ${TimeoutSeconds}s. Check $LogErr"
    exit 1
}

Write-Host "[start-v5] Service is READY (PID $($proc.Id))."
Write-Host "  Live Health : $liveUrl"
Write-Host "  Ready Health: $readyUrl"
Write-Host "  Web Tester  : $testerUrl"
Write-Host "  OpenAPI Docs: http://${HostAddr}:${Port}/docs"
