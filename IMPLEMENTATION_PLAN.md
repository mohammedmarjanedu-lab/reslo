# RESLO — Implementation Plan
### World-Class, Lag-Free FEM Web Application with AI Loop Engineering & Persistent Memory
*(Free Hosting · PC-Speed · Graphify-Driven · Main Elements Frozen Unless Asked)*

| | |
|---|---|
| **Document** | `IMPLEMENTATION_PLAN.md` |
| **Prepared by** | Lead FEM-Web Architect + AI Loop-Engineering / Graphify / OpenCode specialist |
| **Date** | 2026-07-18 |
| **Status** | Planning (no main elements modified without explicit request) |
| **Constraint** | Free-only hosting · Lag-free · Do not change main elements unless asked |

---

## 0. Executive Summary

RESLO is a structural RC slab FEM/analysis tool: a **Vite + Svelte 5** SPA with a
Canvas-2D plan editor, an in-browser **Web Worker** Q4 plate solver, an optional
**three.js** 3D view, and a Python **FastAPI + OpenSeesPy** backend. The render loop
already uses a `dirty` flag and memo caches — the foundation for a lag-free app exists.

This plan does three things:
1. **Makes it lag-free & free-hosted** (non-destructive perf + packaging).
2. **Integrates Graphify + a Loop-Engineering AI layer** so the system *remembers*
   (persistent structural-graph memory), *reasons* over its own architecture, and
   *self-improves* through an observe → remember → reason → act → verify loop.
3. **Encodes your hard rules** (no main-element changes unless asked, lag-free,
   free hosting, PC-speed).

The AI/memory/loop machinery is built as **additive infrastructure** on top of the
existing `graphModel.ts` (compact graph + compression + token estimate) and
`headroom.ts` (token budget). None of it alters Toolbar, Panels, canvas draw order,
solver outputs, or store shapes.

---

## 1. Verified Architecture

```
reslo/
├─ src/
│  ├─ App.svelte                   Orchestrator: worker, health poll, FEM debounce
│  ├─ lib/engine/
│  │  ├─ types.ts                  Domain types
│  │  ├─ femSolver.ts              Q4 plate solver (browser, in worker)
│  │  ├─ graphModel.ts             ★ StructuralGraph + compress + estimateTokens
│  │  ├─ headroom.ts               ★ Token-budget warnings (800/1500)
│  │  ├─ mathEngine.ts             Area/centroid, global metrics, eccentricity
│  │  ├─ meshGenerator.ts          Point-in-poly, triangulation
│  │  ├─ pyApi.ts                  Frontend ↔ backend HTTP bridge
│  │  └─ awatifBridge.ts           STUB (ready:false)
│  ├─ lib/stores/                  Svelte 5 rune stores (structuralModel, femResults, uiState…)
│  ├─ lib/canvas/                  renderer.ts (draw*), hitTester.ts
│  ├─ lib/components/              Svelte UI (Toolbar, Panels, WorkspaceCanvas…)
│  ├─ lib/workers/fem.worker.ts    → analyzeAllSlabs (local only; backend bypassed)
│  └─ lib/export/                  DXF / E2K / PDF
├─ backend/                        FastAPI + OpenSeesPy + DKT fallback (+ Dockerfile)
├─ graphify-out/                   ★ Code-graph corpus (772 nodes / 1489 edges / 101 communities)
│  ├─ GRAPH_REPORT.md              Community hubs, god-nodes, import cycles
│  ├─ manifest.json                Per-file ast_hash + semantic_hash (change detection)
│  ├─ graph.json / graph.html      Interactive graph
│  └─ h8graphify.py, headroom_wrapper.py  Compression pipeline
├─ index.html, vite.config.ts, railway.json (frontend), backend/railway.json
```

### 1.1 Verified data flow
- **Edit →** `structuralModel` (single source of truth, rune store)
- **Render →** `WorkspaceCanvas.svelte` rAF loop, gated by `dirty` + memo caches
- **Solve →** `fem.worker.ts` → local `analyzeAllSlabs` → posts `RESULT` to `femResults`
- **Backend (optional)** → `pyApi.ts` → FastAPI; **not currently invoked by worker**

### 1.2 graphify insights (from `GRAPH_REPORT.md`)
- `StructuralModel` is the central hub (62 edges) — cross-community bridge.
- **No import cycles** detected.
- God-nodes: `StructuralModel`, `FEMResultState`, `analyze_slab`, `Point2D`, `DxfWriter`.
- `models.py` cohesion **0.06**, `femSolver.ts` **0.11** → module-split candidates (refactor only).

### 1.3 Existing AI-memory primitives (key finding)
The repo already contains the seeds of an AI memory system:
- `graphModel.ts`: `StructuralGraph` (compact node/edge model), `compressGraph(level)`,
  `estimateTokens()`, `buildGraph()` — a **token-efficient world model**.
- `headroom.ts`: token-budget guardrails (800/1500) for LLM context.
- `graphify-out/manifest.json`: per-file `ast_hash` + `semantic_hash` → enables
  **deterministic change detection** (the basis for persistent memory + loop triggers).

These three are the foundation we extend — not replace.

---

## 2. Performance Audit (lag sources, ranked)

| # | Location | Issue | Impact | Fix |
|---|----------|-------|--------|-----|
| P1 | `WorkspaceCanvas.svelte:864-927` | Joint dots drawn per-vertex every redraw (O(V)) | High | Offscreen-canvas cache |
| P2 | `WorkspaceCanvas.svelte:388` | `collectAllEdges/Endpoints` re-scanned every mouse-move (O(E)) | High | Model-versioned memo |
| P3 | `WorkspaceCanvas.svelte:590-803` | FEM contour min/max + maps rebuilt every dirty frame | Med-High | `$derived` on results |
| P4 | `history.svelte.ts` | `JSON.parse/stringify` whole model per push (cap 50) | Med | Push on drag-end only |
| P5 | `ThreeViewport.svelte` `MAX_INST=500` | Hard cap silently truncates large 3D | Correctness | Raise + frustum cull |
| P6 | `backend/mesher.py` `_lock` | Global thread lock serializes mesh reqs | Backend | Keep (correctness) |

All P1–P4 fixes are **internal / additive** — no UI change.

---

## 3. AI Loop Engineering Layer (NEW — the differentiator)

### 3.1 Principle
The app becomes a **self-improving system**: every user action, FEM result, and code
change is captured as a memory event; a loop continuously observes the live graph,
reasons over it with graphify, and proposes (never auto-applies) optimizations that
respect the "no main-element change" rule. All memory is **persistent** across sessions
(via `localStorage` + optional free backend), so the AI *remembers* the project.

### 3.2 The Loop (Observe → Remember → Reason → Act → Verify)

```
        ┌──────────────────────────────────────────────────────────┐
        │                   RESLO LOOP ENGINE                       │
        ▼                                                            │
 [OBSERVE]  structuralModel changes, FEM runs, perf probes (fps)    │
        │  emit MemoryEvent {type, payload, ts, graphHash}          │
        ▼                                                            │
 [REMEMBER] append to persistent MemoryStore (localStorage + graph) │
        │  serialize compact StructuralGraph via graphModel.ts      │
        ▼                                                            │
 [REASON]   graphify subgraph + headroom token budget → insights    │
        │  e.g. "slab X has 3x nodes vs slab Y → mesh imbalance"    │
        ▼                                                            │
 [ACT]      generate ADDITIVE suggestions only (never touch mains)  │
        │  → queued as proposals, shown in GraphViewer/Insights tab │
        ▼                                                            │
 [VERIFY]   run vitest bench / build / check; if green → keep       │
        └─────────────────────── loop ──────────────────────────────┘
```

### 3.3 Components to add (additive, new files only)

| File | Purpose | Touches mains? |
|------|---------|----------------|
| `src/lib/ai/memoryStore.svelte.ts` | Persistent memory ring-buffer (localStorage, cap N events) keyed by `manifest.json` hashes | No |
| `src/lib/ai/loopEngine.ts` | The 5-phase loop orchestrator; throttle (e.g. debounce 500 ms) to stay lag-free | No |
| `src/lib/ai/graphifyBridge.ts` | Loads `graphify-out/graph.json`; exposes `queryNeighbors(node)`, `findHotspots()` | No |
| `src/lib/ai/insightPanel.svelte` | UI panel listing AI suggestions (read-only, opt-in) | **New panel, not a main element** |
| `src/lib/ai/perfProbe.ts` | rAF fps sampler → feeds `OBSERVE` (already gated by `dirty`) | No |
| `scripts/sync_graphify.ps1` | Re-runs graphify on change-set (uses manifest hashes) → updates `graphify-out/` | No |

### 3.4 Persistent memory design
- **Event schema:** `{ id, ts, kind: 'edit'|'solve'|'perf'|'code', graphHash, tokenCost, payload }`
- **Storage:** `localStorage['reslo.memory.v1']` (JSON, capped at e.g. 200 events; oldest
  evicted). Each event stores the **compact `StructuralGraph`** (via `graphModel.ts`),
  not the raw model → tiny footprint, respects `headroom.ts` budget.
- **Code-memory:** hash of edited files (from `manifest.json`) stored alongside → the AI
  *remembers which files changed* and can diff against graphify `ast_hash`.
- **Cross-session:** on load, `memoryStore` rehydrates; loop resumes reasoning from the
  last state. This is the "AI is remembering" requirement.

### 3.5 Loop safety (keeps it lag-free & rule-compliant)
- Loop runs **only when idle** (no active drag, `dirty=false`).
- `REASON` is bounded by `headroom.ts` token budget (800/1500) — if over, compress graph (L1/L2/L3).
- `ACT` produces **proposals only**; applying any change requires explicit user approval.
  Proposals are restricted to: perf refactors (P1–P4), module splits, test additions.
  **Never** proposes changes to Toolbar/Panels/canvas draw order/solver outputs.

---

## 4. OpenCode Integration (dev-loop acceleration)

- Use **OpenCode agents** (`explore` / `general`) to run the `REASON` phase against the
  graphify corpus off the critical path (background tasks), keeping the UI thread free.
- Add an `AGENTS.md` (new file) documenting the loop, the no-main-element rule, and the
  free-deploy commands, so future OpenCode sessions inherit memory of *how to work here*.
- Graphify `manifest.json` hashes double as the **source-of-truth change signal** for
  OpenCode to know what to re-analyze — avoiding full re-scans (lag-free dev).

---

## 5. Goals & Non-Goals

**Goals**
- ≈60 fps pan/zoom/draw on 200+ element models.
- FEM solve off main thread with visible progress.
- **Persistent AI memory** + self-improvement loop, fully additive.
- Free, CDN-edge hosting, instant cold loads.
- Zero regressions in numerical results or UI.

**Non-Goals (frozen unless you ask)**
- No change to Toolbar, Panels, canvas draw order, solver math outputs, store shapes.
- No feature removal. No paid tiers. Loop never auto-applies main-element changes.

---

## 6. Implementation Phases

### Phase 0 — Architecture decisions (YOU sign off; no code)
- [ ] **D1:** Backend OpenSeesPy — **MANDATORY (always deployed, always primary)**. Worker is fallback only.
- [ ] **D2:** Worker → backend for big models? (now: backend always primary, worker fallback)
- [ ] **D3:** Raise three.js `MAX_INST` + LOD/frustum cull?
- [ ] **D4:** Activate `awatifBridge` external solver?
- [ ] **D5:** Enable persistent AI memory + loop (Phase 3) by default or opt-in? → *Rec: opt-in*

### Phase 1 — Lag-free rendering (NON-DESTRUCTIVE, additive)
- [ ] **P1** Offscreen joint/grid cache; blit once per frame; rebuild on zoom/pan/model change.
- [ ] **P2** Memoize `collectAllEdges/Endpoints` keyed to model version counter.
- [ ] **P3** Move FEM contour min/max + node maps into a Svelte 5 `$derived` on `femResults`.
- [ ] **P4** History push on drag-end only (throttle during drag).

### Phase 2 — Numerical robustness (NON-DESTRUCTIVE)
- [ ] vitest benchmark: `femSolver.ts` Q4 vs OpenSees suite (prove client correctness).
- [ ] Worker soft-timeout surfacing friendly message (no result change).
- [ ] Keep `awatifBridge` stub unless D4 approved.

### Phase 3 — AI Loop Engineering + Persistent Memory (ADDITIVE, new files)
- [ ] `memoryStore.svelte.ts` — persistent ring buffer (localStorage) of compact graphs.
- [ ] `loopEngine.ts` — 5-phase loop, idle-gated, headroom-bounded.
- [ ] `graphifyBridge.ts` — load `graphify-out/graph.json`; neighbor/hotspot queries.
- [ ] `perfProbe.ts` — fps sampler feeding `OBSERVE`.
- [ ] `insightPanel.svelte` — read-only suggestion list (opt-in via D5).
- [ ] `scripts/sync_graphify.ps1` — re-run graphify on manifest-hash change-set.
- [ ] Wire `OBSERVE` to existing `structuralModel` `$effect` (no behavior change).

### Phase 4 — Free hosting packaging
- [ ] Frontend (static, $0): `vercel.json` OR `netlify.toml` SPA rewrite → `dist/`.
- [ ] Backend (optional, $0): `backend/Dockerfile` + `backend/railway.json` present; add
  `/api/health` ping from frontend to wake free tier.
- [ ] `AGENTS.md` (new) documenting loop + rules + free-deploy commands.
- [ ] Replace stock Vite `README.md` with real deploy + usage doc.

### Phase 5 — Verification (no behavior change)
- [ ] `npm run build` passes (strict TS: `noUnusedLocals`/`noUnusedParameters`).
- [ ] `npm run check` clean; `npm run test` green.
- [ ] Manual: 200+ elements → 60 fps; loop idle (no fps drop); memory rehydrates on reload.

---

## 7. Hosting Matrix (free only)

| Component | Free Option | Notes |
|-----------|-------------|-------|
| Frontend SPA | **Vercel** / **Netlify** / **Cloudflare Pages** | $0, global CDN edge, instant load |
| Backend API (optional) | **Railway free** / **Render free** | Sleeps ~15 min idle (cold-start) |
| AI memory store | **localStorage** (client) + optional free backend | $0, persistent |
| CI | Provider git-push build | $0 |

> If D1 = 100% client-side, **no backend hosting needed** → fastest + cheapest.

---

## 8. Hard Rules (your constraints, encoded)

1. **Do not modify main elements** (Toolbar, Panels, canvas draw order, solver outputs,
   store shapes) unless you explicitly request.
2. **Lag-free:** all perf + loop work is internal/additive; loop runs only when idle.
3. **Hostable + fast:** static SPA on free CDN edge = near-native speed.
4. **Free only:** Vercel/Netlify/Cloudflare (frontend, $0) + optional Railway/Render (backend, $0).
5. **AI remembers, but never overrides:** loop produces proposals; application needs approval.

---

## 9. Rollout Order

1. You approve D1–D5 (or defer).
2. **Phase 1** (lag-free) — ships value, zero risk.
3. **Phase 2** (robustness) — vitest bench + worker timeout.
4. **Phase 3** (AI loop + memory) — additive infrastructure; opt-in via D5.
5. **Phase 4** (hosting) — `vercel.json`/`netlify.toml` + AGENTS.md + README.
6. **Phase 5** verification gate before deploy.

---

## 10. Open Questions for You

| ID | Question | Recommendation |
|----|----------|----------------|
| D1 | Backend OpenSees or 100% client-side? | 100% client-side |
| D2 | Worker → backend for big models? | Only if D1=keep |
| D3 | Raise three.js cap + LOD? | Raise to 5000 + cull |
| D4 | Activate `awatifBridge`? | Leave stub unless asked |
| D5 | Enable AI memory + loop by default or opt-in? | Opt-in |

---

*End of plan. Say "implement Phase 1" to begin lag-free rendering, or "implement Phase 3"
to build the AI loop + memory layer, or answer D1–D5 first.*
