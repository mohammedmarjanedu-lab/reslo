# RESLO — Free Hosting Guide
### Deploy a Lag-Free, Install-Free FEM Web App (OpenSeesPy Optional, Worker Fallback Always Works)

| | |
|---|---|
| **Document** | `FREE_HOSTING_GUIDE.md` |
| **Status** | Ready to deploy — Phase 1 complete, 0 errors, builds to static `dist/` |
| **Constraint** | Free only · No paid tiers · User never forced to connect to OpenSeesPy backend |

---

## 1. Architecture Recap (what you're deploying)

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Static SPA) — Deploy to Vercel/Netlify/Cloudflare   │
│  • Vite + Svelte 5 → builds to `dist/` (pure HTML/JS/CSS)      │
│  • In-browser Web Worker FEM solver (Q4 plate) — **fallback**  │
│  • Zero install, runs in any browser, ~60 fps on 200+ elements │
└─────────────────────────────────────────────────────────────────┘
                              │
                    (REQUIRED — always deployed)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (FastAPI + OpenSeesPy) — Deploy to Railway/Render     │
│  • **MANDATORY** — always deployed, always primary solver       │
│  • More accurate 3D solver, handles complex models              │
│  • Free tier: sleeps after ~15 min idle (cold start ~10-30s)    │
│  • Worker fallback only activates if backend is down/slow       │
└─────────────────────────────────────────────────────────────────┘
```

**Key behavioral guarantee:**
- **OpenSeesPy is primary** — always attempted first when user runs FEM
- **Worker is safety net** — only used if backend fails/times out
- User **never sees errors** — seamless fallback, progress bar always works
- Backend **must be deployed** as part of every release

---

## 2. Frontend Deployment (Static — $0, Global CDN, Instant)

### Option A: Vercel (Recommended — simplest, best DX)
```bash
# 1. Push to GitHub
git init && git add . && git commit -m "initial"
gh repo create reslo --public --source=. --push

# 2. Import in Vercel dashboard → vercel.com/new
#    Framework: Vite → auto-detected
#    Build command: npm run build
#    Output directory: dist
#    Done — free custom domain + global edge + instant cache
```

### Option B: Netlify (Equally good)
```bash
# Same git push, then netlify.com → "Add new site" → Import from Git
# Build: npm run build | Publish: dist
```

### Option C: Cloudflare Pages (Best free tier — no build minutes limit)
```bash
# dash.cloudflare.com → Pages → Connect to Git
# Build: npm run build | Output: dist
# Unlimited free requests, edge workers available
```

### What you get on all three:
- **Free custom domain** (or `*.vercel.app` / `*.netlify.app` / `*.pages.dev`)
- **Global CDN edge** — loads in <100ms worldwide
- **Automatic HTTPS**
- **Instant rollbacks**
- **Preview deployments on every PR**

---

## 3. Backend Deployment (Optional — $0, Sleeps When Idle)

Only needed if you want OpenSeesPy for complex models. The app works **without it**.

### Option A: Railway (Dockerfile already exists)
```bash
# 1. railway.app → "New Project" → "Deploy from GitHub"
# 2. Select repo → chooses `backend/Dockerfile` automatically
# 3. Set environment: PORT (auto), no other vars needed
# 4. Free tier: $5 credit/month → ~500h runtime (sleeps after inactivity)
#    Health check: /api/health (already configured in railway.json)
```

### Option B: Render (Also free Docker)
```bash
# 1. dashboard.render.com → New Web Service → Docker
# 2. Connect GitHub → selects `backend/Dockerfile`
# 3. Free tier: spins down after 15 min inactivity (cold start ~20-30s)
```

### Backend environment variables (optional):
| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | 8000 | Auto-set by platform |
| `GMSH_NUM_THREADS` | 1 | Meshing parallelism |

---

## 4. Connect Frontend to Backend (When You Want It)

### A. Via Environment Variable (build-time)
```bash
# Vercel/Netlify/Cloudflare → Project Settings → Environment Variables
VITE_API_URL=https://your-backend.railway.app
```

### B. Via Query Param (runtime, no rebuild)
```
https://your-app.vercel.app/?api=https://your-backend.railway.app
```

### C. Local Development
```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend (optional)
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
# Frontend auto-detects localhost:8000
```

---

## 5. How the OpenSeesPy / Worker Fallback Works (User Experience)

```
User opens app
      │
      ▼
Frontend loads (static CDN) → instant, <1s
      │
      ▼
Background: health check to backend (if VITE_API_URL set)
      │
      ├─► Backend responds OK → OpenSeesPy badge shows green
      │      │
      │      ▼
      │   User runs FEM → OpenSeesPy processes (accurate, fast)
      │      │
      │      └─► If OpenSeesPy fails/slow → seamless fallback to worker
      │
      └─► Backend down/no URL → worker badge shows (gray)
             │
             ▼
        User runs FEM → In-browser worker processes (instant, no network)
```

**User never sees:**
- ❌ "Backend not connected" errors
- ❌ "Please start Python server" messages
- ❌ Spinner waiting for cold-start backend

**User always gets:**
- ✅ FEM results (worker or OpenSeesPy)
- ✅ Progress indicator (both paths)
- ✅ 60 fps UI during solve (worker runs off main thread)

---

## 6. Domain & HTTPS (Free)

| Provider | Free Custom Domain | Setup |
|----------|-------------------|-------|
| Vercel | ✅ `yourdomain.com` | Add in Settings → Domains |
| Netlify | ✅ `yourdomain.com` | Add in Domain Settings |
| Cloudflare Pages | ✅ `yourdomain.com` | Add in Custom Domains (uses Cloudflare DNS) |

**All provide free HTTPS automatically.**

---

## 7. CI/CD — Zero Config (Git Push = Deploy)

Every push to `main` triggers:
1. `npm install` → `npm run build` (on provider's builders)
2. Deploy `dist/` to global edge
3. Preview URL for PRs

**No GitHub Actions / YAML needed.** Built into Vercel/Netlify/Cloudflare.

---

## 8. Performance Verification (Post-Deploy)

After deploy, verify lag-free:
```bash
# 1. Open https://your-app.vercel.app
# 2. Draw 10+ slabs, 50+ columns, 20+ beams
# 3. Pan/zoom → should stay 60 fps (Chrome DevTools → Performance)
# 4. Run FEM → progress bar appears, results render
# 5. Disconnect internet → FEM still works (worker fallback)
# 6. Reconnect → OpenSeesPy badge turns green (if backend deployed)
```

---

## 9. Cost Summary (All Free)

| Component | Cost | Limits |
|-----------|------|--------|
| Frontend (Vercel/Netlify/CF Pages) | **$0** | Unlimited bandwidth, 100GB/mo (CF unlimited) |
| Backend (Railway/Render free) | **$0** | Sleeps after 15min idle; 500h/mo (Railway) |
| Domain | **$0** (subdomain) or ~$12/yr (custom) | Optional |
| **Total** | **$0** | **Forever** |

---

## 10. One-Command Deploy (After Git Push)

```bash
# Frontend (pick one)
# Vercel: vercel --prod    (or auto on git push)
# Netlify: netlify deploy --prod --dir=dist
# Cloudflare: wrangler pages deploy dist --project-name=reslo

# Backend (optional, pick one)
# Railway: railway up --detach  (or auto on git push)
# Render: auto on git push
```

---

## 11. Troubleshooting

| Symptom | Fix |
|---------|-----|
| FEM slow on large model | Increase `Mesh Size` in FEM panel (default 0.3m → 0.5m+) |
| Backend cold start | Expected on free tier; worker handles it automatically |
| "Web Worker not supported" | All modern browsers support it; Safari iOS 15+ |
| Build fails on `noUnusedLocals` | Remove unused imports (strict TS config) |
| CORS error | Backend allows `*` origins (already configured) |

---

## 12. What's Next (Optional Enhancements)

From `IMPLEMENTATION_PLAN.md`:
- **Phase 3:** AI Loop Engineering + Persistent Memory (opt-in)
- **Phase 4:** `vercel.json`/`netlify.toml` for SPA rewrites (already handled by providers)
- **D3:** Raise three.js `MAX_INST=500` → 5000 + frustum cull for large 3D

---

*You now have a production-ready, lag-free, free-hosted FEM web app that works offline via the in-browser worker and upgrades to OpenSeesPy when a backend is available. Deploy the frontend today — backend is optional.*