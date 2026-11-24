<#
.SYNOPSIS
    Stops the background Facial Expression V5 service started by start-v5.ps1.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ServiceRoot = Split-Path -Parent $PSScriptRoot
$PidPath = Join-Path $ServiceRoot 'tmp\v5-service.pid'

if (-not (Test-Path $PidPath)) {
    Write-Host "[stop-v5] No PID file found at $PidPath."
    exit 0
}

$pidRaw = (Get-Content $PidPath -Raw).Trim()
if ($pidRaw -match '^\d+$') {
    $targetPid = [int]$pidRaw
    $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $targetPid -Force
        Write-Host "[stop-v5] Stopped V5 service process (PID $targetPid)."
    } else {
        Write-Host "[stop-v5] Process PID $targetPid is not running."
    }
}
Remove-Item -Path $PidPath -Force -ErrorAction SilentlyContinue
