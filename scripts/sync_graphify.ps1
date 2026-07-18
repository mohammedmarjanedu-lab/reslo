#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Sync Graphify - Re-run graphify analysis on changed files only.

.DESCRIPTION
    Reads manifest.json to detect which files have changed (ast_hash/semantic_hash),
    then runs the graphify pipeline (h8graphify.py + headroom_wrapper.py) incrementally.
    Updates graphify-out/ with fresh graph.json, GRAPH_REPORT.md, etc.

.NOTES
    Requires: Python 3.10+, graphify dependencies (see requirements.txt or pyproject.toml)
    Run from repo root: .\scripts\sync_graphify.ps1

.EXAMPLE
    .\scripts\sync_graphify.ps1
    .\scripts\sync_graphify.ps1 -ForceFull
    .\scripts\sync_graphify.ps1 -Verbose
#>

param(
    [Parameter()]
    [switch] $ForceFull,

    [Parameter()]
    [switch] $Verbose,

    [Parameter()]
    [string] $RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-VerboseMsg {
    param([string] $Message)
    if ($Verbose) { Write-Host "[VERBOSE] $Message" -ForegroundColor Cyan }
}

function Write-Step {
    param([string] $Message)
    Write-Host "▶ $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string] $Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string] $Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

$repoRoot = Resolve-Path $RepoRoot
$graphifyDir = Join-Path $repoRoot "graphify-out"
$manifestPath = Join-Path $graphifyDir "manifest.json"
$h8graphify = Join-Path $repoRoot "h8graphify.py"
$headroomWrapper = Join-Path $repoRoot "headroom_wrapper.py"
$headroomInit = Join-Path $repoRoot "headroom_init.py"
$srcDir = Join-Path $repoRoot "src"
$backendDir = Join-Path $repoRoot "backend"

if (-not (Test-Path $manifestPath)) {
    Write-Err "Manifest not found at $manifestPath. Run graphify once first."
    exit 1
}

Write-Step "Reading manifest..."
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

$changedFiles = @()
$allFiles = @()

foreach ($entry in $manifest.PSObject.Properties) {
    $relPath = $entry.Name
    $fullPath = Join-Path $repoRoot $relPath
    $data = $entry.Value

    if (-not (Test-Path $fullPath)) {
        Write-VerboseMsg "Deleted: $relPath"
        $changedFiles += $relPath
        continue
    }

    $currentHash = Get-FileHash -Path $fullPath -Algorithm SHA256 | Select-Object -ExpandProperty Hash
    $currentHash = $currentHash.ToLower()

    if ($currentHash -ne $data.ast_hash -or $currentHash -ne $data.semantic_hash) {
        Write-VerboseMsg "Changed: $relPath"
        $changedFiles += $relPath
    }
    $allFiles += $relPath
}

if ($ForceFull) {
    Write-Warn "ForceFull specified - treating all files as changed"
    $changedFiles = $allFiles
}

if ($changedFiles.Count -eq 0) {
    Write-Host "✓ No changes detected. Graphify output is up to date." -ForegroundColor Green
    exit 0
}

Write-Step "Changed files: $($changedFiles.Count)"
if ($Verbose) { $changedFiles | ForEach-Object { Write-Host "  $_" } }

$pythonCmd = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } else {
    Write-Err "Python not found in PATH"
    exit 1
}

Write-Step "Running h8graphify.py..."
$args = @(
    $h8graphify,
    "--root", $repoRoot,
    "--out", $graphifyDir,
    "--manifest", $manifestPath
)
if ($Verbose) { $args += "--verbose" }
& $pythonCmd @args
if ($LASTEXITCODE -ne 0) { Write-Err "h8graphify.py failed"; exit $LASTEXITCODE }

Write-Step "Running headroom_wrapper.py..."
$args = @(
    $headroomWrapper,
    "--graph", (Join-Path $graphifyDir "graph.json"),
    "--manifest", $manifestPath,
    "--out", (Join-Path $graphifyDir "headroom.json")
)
if ($Verbose) { $args += "--verbose" }
& $pythonCmd @args
if ($LASTEXITCODE -ne 0) { Write-Err "headroom_wrapper.py failed"; exit $LASTEXITCODE }

Write-Step "Running headroom_init.py (token compression)..."
$args = @(
    $headroomInit,
    "--headroom", (Join-Path $graphifyDir "headroom.json"),
    "--out", (Join-Path $graphifyDir "compressed")
)
if ($Verbose) { $args += "--verbose" }
& $pythonCmd @args
if ($LASTEXITCODE -ne 0) { Write-Err "headroom_init.py failed"; exit $LASTEXITCODE }

Write-Step "Updating manifest with new hashes..."
$newManifest = @{}
foreach ($relPath in $allFiles) {
    $fullPath = Join-Path $repoRoot $relPath
    if (Test-Path $fullPath) {
        $currentHash = Get-FileHash -Path $fullPath -Algorithm SHA256 | Select-Object -ExpandProperty Hash
        $currentHash = $currentHash.ToLower()
        $newManifest[$relPath] = @{
            mtime = (Get-Item $fullPath).LastWriteTimeUtc.ToString('o')
            ast_hash = $currentHash
            semantic_hash = $currentHash
        }
    }
}
$newManifest | ConvertTo-Json -Depth 5 | Set-Content $manifestPath -Encoding utf8

Write-Step "Regenerating GRAPH_REPORT.md..."
$args = @(
    $h8graphify,
    "--report-only",
    "--graph", (Join-Path $graphifyDir "graph.json"),
    "--out", (Join-Path $graphifyDir "GRAPH_REPORT.md")
)
& $pythonCmd @args
if ($LASTEXITCODE -ne 0) { Write-Warn "Report generation failed (non-fatal)" }

Write-Host "✓ Graphify sync complete. Output in $graphifyDir" -ForegroundColor Green