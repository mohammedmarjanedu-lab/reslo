# Reslo — Local Hosting & Startup Guide

Follow this guide to launch and run Reslo on your machine after a restart. This will start the high-performance **OpenSeesPy Python Backend** (port 8000) and the **Svelte/Vite Frontend** (port 5173).

---

## 🚀 Quick Start (Fastest Way)

1. Open **Windows PowerShell** or Command Prompt.
2. Navigate to your project directory:
   ```powershell
   cd "C:\Users\moham\Downloads\Telegram Desktop\reslo Project1\reslo Project\reslo.v21\reslo"
   ```
3. Run the automated startup script:
   ```powershell
   .\start_local.ps1
   ```
4. Once running, open your web browser and go to:
   👉 **[http://localhost:5173](http://localhost:5173)**

---

## ⚠️ CRITICAL: Web Browser Security Note
> [!IMPORTANT]
> **Use the local address `http://localhost:5173` when designing structures.**
> If you visit the public Vercel URL (`https://reslo-eosin.vercel.app/` which is HTTPS), the browser's security rules will block all connection requests to your local Python backend (`http://localhost:8000` which is HTTP) due to **Mixed Content Security Rules**.
> 
> To ensure the website can communicate with your local OpenSeesPy backend, always use the local **`http://localhost:5173`** URL.

---

## 🛠️ Troubleshooting

### 1. PowerShell Script Execution is Disabled
If you see an error saying script execution is restricted on your system, run this command to temporarily allow the startup script for your current terminal session:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
Then run `.\start_local.ps1` again.

### 2. Port is Already Occupied
The startup script automatically detects and kills any stale processes running on ports `8000` and `5173` before starting. However, if you ever need to manually close the servers, run:
```powershell
.\stop_tunnel.ps1
```
Or simply press `Ctrl + C` in the PowerShell window running the script.

### 3. Check Backend Connection Status
* The **Calculation Engine** status at the bottom-left of the sidebar will display a green light and say **OpenSeesPy Connected** once the server starts successfully.
* If it displays a yellow light (**Local Solver Fallback**), it means the frontend dev server is running but cannot reach the Python backend on port 8000. Verify the PowerShell startup logs for any Python errors.
