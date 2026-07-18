# Start Reslo Backend + Svelte Frontend + Cloudflare Tunnels

# Helper to read files that are locked by running background processes
function Get-SharedContent($path) {
    if (Test-Path $path) {
        try {
            $file = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $reader = New-Object System.IO.StreamReader($file)
            $text = $reader.ReadToEnd()
            $reader.Close()
            $file.Close()
            return $text
        } catch {
            return $null
        }
    }
    return $null
}

# Helper to poll for trycloudflare.com URL up to 20 seconds
function Get-TunnelUrl($logPath) {
    for ($i = 0; $i -lt 20; $i++) {
        $log = Get-SharedContent $logPath
        if ($log -and ($log -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)")) {
            return $Matches[1]
        }
        Start-Sleep -Seconds 1
    }
    return $null
}

# 1. Stop any existing backend processes on port 8000 and 5173
Write-Host "Checking for existing processes on ports 8000 and 5173..." -ForegroundColor Cyan
$ports = @(8000, 5173)
foreach ($port in $ports) {
    $existingConn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($existingConn) {
        Write-Host "Port $port is occupied. Terminating existing process..." -ForegroundColor Yellow
        foreach ($conn in $existingConn) {
            if ($conn.OwningProcess -gt 0) {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
Start-Sleep -Seconds 1

# 2. Stop any existing cloudflared process
Write-Host "Stopping any running cloudflared processes..." -ForegroundColor Cyan
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue

# 3. Start the FastAPI backend
Write-Host "Starting FastAPI backend..." -ForegroundColor Cyan
$pyExe = (Get-Command py).Source
$backendJob = Start-Process $pyExe -ArgumentList "-3.12", "backend/main.py" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru

# 4. Start Backend Cloudflare Tunnel
Write-Host "Starting Backend Cloudflare Tunnel..." -ForegroundColor Cyan
if (Test-Path "tunnel.log") { Remove-Item "tunnel.log" -Force -ErrorAction SilentlyContinue }
$tunnelBackend = Start-Process "C:\Program Files (x86)\cloudflared\cloudflared.exe" -ArgumentList "tunnel --url http://127.0.0.1:8000" -WorkingDirectory $PSScriptRoot -RedirectStandardError "tunnel.log" -WindowStyle Hidden -PassThru

# 5. Wait for Backend Tunnel and extract the URL to configure .env
Write-Host "Waiting for Backend Tunnel to connect..." -ForegroundColor Cyan
$backendUrl = Get-TunnelUrl "tunnel.log"

if ($backendUrl) {
    # Automatically write VITE_API_URL to the .env file
    "VITE_API_URL=$backendUrl" | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "Sync Complete: Configured Svelte frontend to connect to $backendUrl" -ForegroundColor Green
    
    # 6. Start Svelte frontend dev server (Vite loads correct VITE_API_URL on start!)
    Write-Host "Starting Svelte frontend (Vite)..." -ForegroundColor Cyan
    $frontendJob = Start-Process npm.cmd -ArgumentList "run dev" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2

    # 7. Start Frontend Cloudflare Tunnel
    Write-Host "Starting Frontend Cloudflare Tunnel..." -ForegroundColor Cyan
    if (Test-Path "tunnel_frontend.log") { Remove-Item "tunnel_frontend.log" -Force -ErrorAction SilentlyContinue }
    $tunnelFrontend = Start-Process "C:\Program Files (x86)\cloudflared\cloudflared.exe" -ArgumentList "tunnel --url http://localhost:5173 --http-host-header localhost" -WorkingDirectory $PSScriptRoot -RedirectStandardError "tunnel_frontend.log" -WindowStyle Hidden -PassThru
    
    Write-Host "Waiting for Frontend Tunnel to connect..." -ForegroundColor Cyan
    $frontendUrl = Get-TunnelUrl "tunnel_frontend.log"
    
    if ($frontendUrl) {
        # Format shareable links with query params
        $cloudflareShareLink = "$frontendUrl/?api=$backendUrl"
        $surgeShareLink = "https://reslo-graph.surge.sh/?api=$backendUrl"

        Write-Host "`n=================================================================" -ForegroundColor Green
        Write-Host " RESLO IS LIVE AND ACCESSIBLE FROM ANYWHERE IN THE WORLD!" -ForegroundColor Green
        Write-Host "=================================================================" -ForegroundColor Green
        Write-Host " 🌐 FRONTEND URL (Cloudflare Quick Tunnel):" -ForegroundColor Cyan
        Write-Host "    $cloudflareShareLink" -ForegroundColor Yellow
        Write-Host " 🚀 FRONTEND URL (Surge Production Deployment):" -ForegroundColor Cyan
        Write-Host "    $surgeShareLink" -ForegroundColor Yellow
        Write-Host " ⚙️  BACKEND API URL:" -ForegroundColor Cyan
        Write-Host "    $backendUrl" -ForegroundColor Yellow
        Write-Host "=================================================================" -ForegroundColor Green
        Write-Host "To stop hosting everything, run: .\stop_tunnel.ps1" -ForegroundColor Yellow
    } else {
        Write-Host "Backend tunnel is online, but frontend tunnel failed to establish." -ForegroundColor Red
        Write-Host "Please check tunnel_frontend.log for details." -ForegroundColor Yellow
    }
} else {
    Write-Host "Failed to retrieve the trycloudflare.com URL for backend." -ForegroundColor Red
    Write-Host "Please check tunnel.log for errors." -ForegroundColor Yellow
}
