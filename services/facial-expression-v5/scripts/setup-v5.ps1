<#
.SYNOPSIS
    Sets up the Python 3.12 virtual environment and verifies Facial Expression V5 artifacts.
#>
[CmdletBinding()]
param(
    [switch]$ForceReinstall
)

$ErrorActionPreference = 'Stop'
$ServiceRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ServiceRoot)
$VenvDir = Join-Path $ServiceRoot '.venv'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
$RequirementsPath = Join-Path $ServiceRoot 'requirements.txt'
$EnvExamplePath = Join-Path $ServiceRoot '.env.example'
$EnvPath = Join-Path $ServiceRoot '.env'

function Resolve-Python312 {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        try {
            $ver = & py -3.12 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>$null
            if ($LASTEXITCODE -eq 0 -and $ver -match '^3\.12\.') {
                return @{ Exe = 'py'; Args = @('-3.12'); Version = $ver.Trim() }
            }
        } catch {}
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        $ver = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>$null
        if ($LASTEXITCODE -eq 0 -and $ver -match '^3\.12\.') {
            return @{ Exe = 'python'; Args = @(); Version = $ver.Trim() }
        }
    }
    throw "Python 3.12 is required. Install Python 3.12 and ensure 'py -3.12' or 'python' is on PATH."
}

$pyInfo = Resolve-Python312
Write-Host "[setup-v5] Using Python $($pyInfo.Version)"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[setup-v5] Creating virtual environment at $VenvDir"
    & $pyInfo.Exe @($pyInfo.Args + @('-m', 'venv', $VenvDir))
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create Python virtual environment."
    }
} else {
    Write-Host "[setup-v5] Existing virtual environment found at $VenvDir"
}

if ($ForceReinstall -or -not (Test-Path (Join-Path $VenvDir 'Lib\site-packages\torch'))) {
    Write-Host "[setup-v5] Installing dependencies from requirements.txt..."
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r $RequirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "pip install failed."
    }
} else {
    Write-Host "[setup-v5] Dependencies already present in .venv (pass -ForceReinstall to reinstall)."
}

if (-not (Test-Path $EnvPath)) {
    Write-Host "[setup-v5] Creating local .env from .env.example with generated local token..."
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    $generatedToken = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
    $envLines = Get-Content $EnvExamplePath
    $updatedLines = foreach ($line in $envLines) {
        if ($line -match '^V5_SERVICE_TOKEN=') {
            "V5_SERVICE_TOKEN=$generatedToken"
        } else {
            $line
        }
    }
    Set-Content -Path $EnvPath -Value $updatedLines -Encoding UTF8
} else {
    Write-Host "[setup-v5] Existing .env preserved."
}

Write-Host "[setup-v5] Verifying V5 model artifacts and initialization..."
Push-Location $ServiceRoot
try {
    & $VenvPython -c "from app.core.config import get_settings; from app.models.loader import load_v5_bundle; cfg=get_settings(); b=load_v5_bundle(cfg.v5_model_dir, requested_device=cfg.v5_device, warmup=True); print('OK:', b.device_label, 'classes=', b.class_order, 'members=', len(b.members), 'load_ms=', b.load_duration_ms)"
    if ($LASTEXITCODE -ne 0) {
        throw "V5 model artifact verification failed."
    }
} finally {
    Pop-Location
}

Write-Host "[setup-v5] Setup and model verification succeeded."
