<#
.SYNOPSIS
Wraps any graphify command with Headroom compression proxy.

.DESCRIPTION
Starts Headroom proxy, sets environment variables so graphify's LLM
calls route through Headroom's compression layer, runs the command,
then stops the proxy. Reports token savings.

.EXAMPLE
.\headroom_wrap_graphify.ps1 extract C:\project --no-cluster
.\headroom_wrap_graphify.ps1 update C:\project
#>
param(
    [string]$GraphifyCommand = "extract",
    [string]$TargetPath = ".",
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"
$resolved = Resolve-Path $TargetPath -ErrorAction SilentlyContinue
if (-not $resolved) { $resolved = $TargetPath }
$target = $resolved.Path
$gOut = Join-Path $target "graphify-out"
$gPyPath = Join-Path $gOut ".graphify_python"
$gPy = if (Test-Path $gPyPath) { (Get-Content $gPyPath -Raw).Trim() } else { "python" }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[H8] Starting Headroom proxy..." -ForegroundColor Cyan

# Start proxy in background job
$proxyJob = Start-Job -Name "HeadroomProxy" -ScriptBlock {
    param($pyExe)
    $env:HEADROOM_MODE = "token"
    & $pyExe -c "
import sys
sys.argv = ['headroom', 'proxy', '--port', '8787', '--mode', 'token']
try:
    from headroom.cli import main
    main()
except SystemExit:
    pass
" 2>&1
} -ArgumentList $gPy

# Wait for proxy to be ready
Start-Sleep -Seconds 3
$oldBase = $env:ANTHROPIC_BASE_URL
$oldOpenai = $env:OPENAI_BASE_URL
$env:ANTHROPIC_BASE_URL = "http://localhost:8787"
$env:OPENAI_BASE_URL = "http://localhost:8787/v1"
$env:HEADROOM_ACTIVE = "1"

try {
    # Build graphify command
    $cmdArgs = @($GraphifyCommand, "`"$target`"") + $ExtraArgs
    $cmd = "& `"$gPy`" -m graphify $cmdArgs"
    Write-Host "[H8] Running: graphify $GraphifyCommand $target $ExtraArgs" -ForegroundColor Cyan

    # Start time
    $start = Get-Date
    Invoke-Expression $cmd
    $elapsed = (Get-Date) - $start

    # Report
    $compPath = Join-Path $gOut ".headroom_compression.json"
    if (Test-Path $compPath) {
        $stats = Get-Content $compPath -Raw | ConvertFrom-Json
        Write-Host "[H8] Session: $($stats.files) chunks - " -ForegroundColor Green -NoNewline
        Write-Host "$($stats.total_original_chars) -> $($stats.total_compressed_chars) chars ($($stats.total_savings_pct)% saved)" -ForegroundColor Green
    }
    Write-Host "[H8] Elapsed: $($elapsed.TotalSeconds.ToString('F1'))s" -ForegroundColor Cyan
}
finally {
    # Restore env
    if ($oldBase) { $env:ANTHROPIC_BASE_URL = $oldBase } else { Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue }
    if ($oldOpenai) { $env:OPENAI_BASE_URL = $oldOpenai } else { Remove-Item Env:OPENAI_BASE_URL -ErrorAction SilentlyContinue }
    Remove-Item Env:HEADROOM_ACTIVE -ErrorAction SilentlyContinue
    # Stop proxy
    Stop-Job $proxyJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $proxyJob -ErrorAction SilentlyContinue | Out-Null
    Write-Host "[H8] Proxy stopped" -ForegroundColor Cyan
}
