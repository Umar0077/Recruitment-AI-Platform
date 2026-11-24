<#
.SYNOPSIS
    Checks health, readiness, and authenticated model info for the running V5 service.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ServiceRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $ServiceRoot '.env'

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

$baseUrl = "http://${HostAddr}:${Port}"
Write-Host "[check-v5] Checking $baseUrl"

$live = Invoke-RestMethod -Uri "$baseUrl/api/v1/health/live" -Method Get -TimeoutSec 5
Write-Host "[check-v5] Live : $($live.status) ($($live.service_version))"

$ready = Invoke-RestMethod -Uri "$baseUrl/api/v1/health/ready" -Method Get -TimeoutSec 5
Write-Host "[check-v5] Ready: $($ready.ready) | device=$($ready.device) | members=$($ready.ensemble_members_loaded) | classes=$($ready.classes_count)"

if ($Token) {
    $headers = @{ Authorization = "Bearer $Token" }
    $info = Invoke-RestMethod -Uri "$baseUrl/api/v1/model/info" -Method Get -Headers $headers -TimeoutSec 5
    Write-Host "[check-v5] Model: $($info.model_name) ($($info.model_version)) | labels=$($info.labels -join ',')"
    $metrics = Invoke-RestMethod -Uri "$baseUrl/api/v1/metrics" -Method Get -Headers $headers -TimeoutSec 5
    Write-Host "[check-v5] Metrics: total=$($metrics.total_requests) ok=$($metrics.successful_inferences) failed=$($metrics.failed_requests) uptime=$($metrics.uptime_seconds)s"
} else {
    Write-Host "[check-v5] V5_SERVICE_TOKEN not set in environment or .env; skipped authenticated endpoint checks."
}
