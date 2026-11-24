<#
.SYNOPSIS
    Starts or verifies the 4-service local InterviewOS + Facial Expression V5 stack on Windows 11.
    Never launches duplicate PostgreSQL, NestJS, Next.js, or V5 FastAPI processes if already listening.
#>
[CmdletBinding()]
param(
    [switch]$StatusOnly,
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$V5Root = Join-Path $RepoRoot 'services\facial-expression-v5'
$V5EnvPath = Join-Path $V5Root '.env'
$LogDir = Join-Path $RepoRoot 'tmp'

function Test-PortListening([string]$TargetHost, [int]$TargetPort) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(400, $false)
        if ($ok -and $client.Connected) {
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

function Read-EnvValue([string]$FilePath, [string]$Key, [string]$DefaultValue) {
    if (-not (Test-Path $FilePath)) { return $DefaultValue }
    foreach ($raw in Get-Content $FilePath) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }
        if ($line.Substring(0, $idx).Trim() -eq $Key) {
            $val = $line.Substring($idx + 1).Trim()
            if ($val) { return $val }
        }
    }
    return $DefaultValue
}

$v5Host = Read-EnvValue $V5EnvPath 'V5_HOST' '127.0.0.1'
$v5Port = [int](Read-EnvValue $V5EnvPath 'V5_PORT' '8765')

Write-Host "=== InterviewOS + Facial Expression V5 Local Stack ==="

# 1. PostgreSQL (127.0.0.1:5432)
$pgUp = Test-PortListening '127.0.0.1' 5432
if ($pgUp) {
    Write-Host "[1/4] PostgreSQL (127.0.0.1:5432): ALREADY RUNNING"
} elseif ($StatusOnly) {
    Write-Host "[1/4] PostgreSQL (127.0.0.1:5432): STOPPED"
} else {
    Write-Host "[1/4] Starting PostgreSQL via database start..."
    Push-Location $RepoRoot
    try {
        & npm --prefix database run start
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start." }
    } finally {
        Pop-Location
    }
}

# 2. FastAPI V5 (127.0.0.1:$v5Port)
$v5Up = Test-PortListening $v5Host $v5Port
if ($v5Up) {
    Write-Host "[2/4] FastAPI V5 (${v5Host}:${v5Port}): ALREADY RUNNING"
} elseif ($StatusOnly) {
    Write-Host "[2/4] FastAPI V5 (${v5Host}:${v5Port}): STOPPED"
} else {
    Write-Host "[2/4] Starting FastAPI V5 service..."
    & (Join-Path $V5Root 'scripts\start-v5.ps1')
    if ($LASTEXITCODE -ne 0) { throw "FastAPI V5 failed to start." }
}

# 3. NestJS Backend (127.0.0.1:4000)
$beUp = Test-PortListening '127.0.0.1' 4000
if ($beUp) {
    Write-Host "[3/4] NestJS Backend (127.0.0.1:4000): ALREADY RUNNING"
} elseif ($StatusOnly) {
    Write-Host "[3/4] NestJS Backend (127.0.0.1:4000): STOPPED"
} else {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Write-Host "[3/4] Starting NestJS Backend on http://localhost:4000..."
    $beProc = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm --prefix backend run start:dev' `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput (Join-Path $LogDir 'backend-dev.out.log') `
        -RedirectStandardError (Join-Path $LogDir 'backend-dev.err.log') `
        -WindowStyle Hidden `
        -PassThru
    Set-Content -Path (Join-Path $LogDir 'backend-dev.pid') -Value "$($beProc.Id)" -Encoding ASCII

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/v1/health/ready' -Method Get -TimeoutSec 2
            if ($resp.data.status -eq 'ok') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 800 }
    }
    if (-not $ready) { throw "NestJS backend did not become ready within ${TimeoutSeconds}s." }
    Write-Host "[3/4] NestJS Backend READY (PID $($beProc.Id))"
}

# 4. Next.js Frontend (localhost:3000)
$feUp = Test-PortListening '127.0.0.1' 3000
if ($feUp) {
    Write-Host "[4/4] Next.js Frontend (localhost:3000): ALREADY RUNNING"
} elseif ($StatusOnly) {
    Write-Host "[4/4] Next.js Frontend (localhost:3000): STOPPED"
} else {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Write-Host "[4/4] Starting Next.js Frontend on http://localhost:3000..."
    $feProc = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm --prefix frontend run dev' `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput (Join-Path $LogDir 'frontend-dev.out.log') `
        -RedirectStandardError (Join-Path $LogDir 'frontend-dev.err.log') `
        -WindowStyle Hidden `
        -PassThru
    Set-Content -Path (Join-Path $LogDir 'frontend-dev.pid') -Value "$($feProc.Id)" -Encoding ASCII

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $feReady = $false
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening '127.0.0.1' 3000) { $feReady = $true; break }
        Start-Sleep -Milliseconds 800
    }
    if (-not $feReady) { throw "Next.js frontend did not start within ${TimeoutSeconds}s." }
    Write-Host "[4/4] Next.js Frontend READY (PID $($feProc.Id))"
}

Write-Host ""
Write-Host "Service Endpoints:"
Write-Host "  Frontend / Admin Login : http://localhost:3000/admin/login"
Write-Host "  Admin Model Lab        : http://localhost:3000/admin/model-lab"
Write-Host "  NestJS API Ready       : http://127.0.0.1:4000/api/v1/health/ready"
Write-Host "  FastAPI V5 Ready       : http://${v5Host}:${v5Port}/api/v1/health/ready"
Write-Host "  FastAPI Standalone UI  : http://${v5Host}:${v5Port}/tester"
