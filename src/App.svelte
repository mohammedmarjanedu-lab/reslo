<script lang="ts">
  import WorkspaceCanvas from './lib/components/WorkspaceCanvas.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import MaterialProperty from './lib/components/MaterialProperty.svelte';
  import MetricsHUD from './lib/components/MetricsHUD.svelte';
  import LayersPanel from './lib/components/LayersPanel.svelte';
  import PropertiesPanel from './lib/components/PropertiesPanel.svelte';
  import ContextMenu from './lib/components/ContextMenu.svelte';
  import ImageUploader from './lib/components/ImageUploader.svelte';
  import GraphViewer from './lib/components/GraphViewer.svelte';
  import ColumnPlacementPanel from './lib/components/ColumnPlacementPanel.svelte';
  import ExportDialog from './lib/components/ExportDialog.svelte';
  import FEMControlPanel from './lib/components/FEMControlPanel.svelte';
  import ThreeViewport from './lib/components/ThreeViewport.svelte';
  import InsightPanel from './lib/ai/insightPanel.svelte';
  import { loopEngine } from './lib/ai/loopEngine.svelte';
  import { memoryStore } from './lib/ai/memoryStore.svelte';
  import { startPerfProbe, perfProbeStop } from './lib/ai/perfProbe';
  import { uiState } from './lib/stores/uiState.svelte';
  import { model } from './lib/stores/structuralModel.svelte';
  import { femState } from './lib/stores/femResults.svelte';
  import { graphStore } from './lib/stores/graphStore.svelte';
  import { floorLayers } from './lib/stores/floorLayers.svelte';
  import type { SlabFEMResult, SlabPolygon, ColumnElement, ShearWallElement, FEMWorkerInput, FEMWorkerOutput } from './lib/engine/types';
  import { meshAndAnalyze, healthCheck, setApiBase, PyApiError } from './lib/engine/pyApi';
  import { computeScaleLabel } from './lib/engine/scaleCalibrator';

  let worker: Worker | null = null;
  let femTimer: ReturnType<typeof setTimeout> | null = null;
  let apiAvailable = false;
  let healthInterval: ReturnType<typeof setInterval> | null = null;

// Phase 3g: Wire OBSERVE - start perf probe; the AI loop starts from its own UI
  $effect(() => {
    startPerfProbe((fps, frameTime) => {
      if (typeof window !== 'undefined') {
        (window as any).__resloPerf = { fps, frameTime, dirty: true };
      }
    });
    return () => { perfProbeStop(); };
  });

  function checkBackend() {
    setApiBase(uiState.apiUrl);
    healthCheck().then(ok => {
      const changed = uiState.backendConnected !== ok;
      uiState.backendConnected = ok;
      apiAvailable = ok;
      if (changed) {
        uiState.setStatusMessage(ok ? 'Python backend connected (OpenSeesPy)' : 'Backend offline — check tunnel');
      }
    });
  }

  $effect(() => {
    uiState.apiUrl;
    checkBackend();
    if (healthInterval) clearInterval(healthInterval);
    healthInterval = setInterval(checkBackend, 15000);
    return () => { if (healthInterval) clearInterval(healthInterval); };
  });

  let graphRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    model.columns; model.walls; model.polylineWalls; model.slabs; model.beams; model.dropPanels;
    model.pixelsPerMeter;
    if (graphRefreshTimer) clearTimeout(graphRefreshTimer);
    graphRefreshTimer = setTimeout(() => graphStore.refresh(), 300);
  });

  // Auto-save to localStorage on model changes
  $effect(() => {
    model.columns; model.walls; model.polylineWalls; model.slabs; model.beams; model.dropPanels;
    model.dimensions; model.hiddenElementIds;
    model.concreteGrade; model.rebarGrade;
    model.scheduleAutoSave();
  });

  $effect(() => {
    // Monitor deep properties to trigger debounced analysis on drags and edits
    model.columns.forEach(c => { c.position.x; c.position.y; c.width; c.depth; c.height; c.rotation; });
    model.walls.forEach(w => { w.startPoint.x; w.startPoint.y; w.endPoint.x; w.endPoint.y; w.thickness; w.height; });
    model.polylineWalls.forEach(pw => { pw.vertices.forEach(v => { v.x; v.y; }); pw.thickness; pw.height; });
    model.beams.forEach(b => { b.startPoint.x; b.startPoint.y; b.endPoint.x; b.endPoint.y; b.width; b.depth; b.height; });
    model.slabs.forEach(s => { s.vertices.forEach(v => { v.x; v.y; }); s.holes.forEach(h => h.forEach(v => { v.x; v.y; })); s.thickness; s.uniformLoad; });
    model.dropPanels.forEach(dp => { dp.vertices.forEach(v => { v.x; v.y; }); dp.width; dp.depth; dp.drop; dp.rotation; });
    model.nonStructuralWalls.forEach(w => { w.startPoint.x; w.startPoint.y; w.endPoint.x; w.endPoint.y; w.thickness; w.height; w.partitionUnitWeight; });
    model.polylineNonStructuralWalls.forEach(pw => { pw.vertices.forEach(v => { v.x; v.y; }); pw.thickness; pw.height; pw.partitionUnitWeight; });

    if (femTimer) clearTimeout(femTimer);
    if (uiState.femAutoCompute && model.slabs.length > 0) {
      femTimer = setTimeout(() => { triggerFEMAnalysis(); }, 400);
    }
  });

  function headroomColor(): string {
    switch (graphStore.report?.level) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'red': return 'bg-red-500';
      case 'critical': return 'bg-red-600';
      default: return 'bg-slate-600';
    }
  }

  function toFrontendResult(slabId: string, mesh: any, result: any, meshSize: number): SlabFEMResult {
    const nodeDeflections = result.nodeDeflections.map((d: any) => ({ nodeId: d.nodeId, wz: d.wz }));
    const momentMx = result.elementMoments.map((m: any) => ({ elementId: m.elementId, value: m.mx }));
    const momentMy = result.elementMoments.map((m: any) => ({ elementId: m.elementId, value: m.my }));
    const momentMxy = result.elementMoments.map((m: any) => ({ elementId: m.elementId, value: m.mxy }));
    const stresses = (result.elementStresses || []).map((s: any) => ({
      elementId: s.elementId, s1: s.s1, s2: s.s2, angle: s.angle, vm: s.vm
    }));
    const shears = (result.elementShears || []).map((s: any) => ({
      elementId: s.elementId, vx: s.vx, vy: s.vy, v1: s.v1, angle: s.angle
    }));
    const membraneForces = (result.elementMembraneForces || []).map((m: any) => ({
      elementId: m.elementId, nx: m.nx, ny: m.ny, nxy: m.nxy, n1: m.n1, n2: m.n2, angle: m.angle
    }));
    const columnPunching = (result.columnPunching || []).map((p: any) => ({
      nodeId: p.nodeId, force_kN: p.force_kN, stress_MPa: p.stress_MPa,
      capacity_MPa: p.capacity_MPa, ratio: p.ratio, status: p.status
    }));

    // PERF: Safe min/max using loops — Math.min(...arr) stack overflows on large arrays
    function safeMin(arr: number[]): number {
      if (arr.length === 0) return 0;
      let m = arr[0];
      for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
      return m;
    }
    function safeMax(arr: number[]): number {
      if (arr.length === 0) return 0;
      let m = arr[0];
      for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
      return m;
    }

    const vxVals = shears.map((s: any) => s.vx);
    const vyVals = shears.map((s: any) => s.vy);
    const nxVals = membraneForces.map((m: any) => m.nx);
    const nyVals = membraneForces.map((m: any) => m.ny);
    const nxyVals = membraneForces.map((m: any) => m.nxy);
    const wzVals = nodeDeflections.map((d: any) => d.wz);
    const mxVals = momentMx.map((m: any) => m.value);
    const myVals = momentMy.map((m: any) => m.value);

    return {
      slabId,
      mesh: {
        nodes: mesh.nodes.map((n: any) => ({ id: n.id, x: n.x, y: n.y })),
        elements: mesh.elements.map((e: any) => ({ id: e.id, nodeIds: e.nodeIds, area: e.area || 0 })),
        meshSize,
      },
      nodeDeflections, momentMx, momentMy, momentMxy, stresses, shears, membraneForces, columnPunching,
      minWz: safeMin(wzVals),
      maxWz: safeMax(wzVals),
      minMx: result.minMx ?? safeMin(mxVals),
      maxMx: result.maxMx ?? safeMax(mxVals),
      minMy: result.minMy ?? safeMin(myVals),
      maxMy: result.maxMy ?? safeMax(myVals),
      minVx: result.minVx ?? safeMin(vxVals),
      maxVx: result.maxVx ?? safeMax(vxVals),
      minVy: result.minVy ?? safeMin(vyVals),
      maxVy: result.maxVy ?? safeMax(vyVals),
      minNx: result.minNx ?? safeMin(nxVals),
      maxNx: result.maxNx ?? safeMax(nxVals),
      minNy: result.minNy ?? safeMin(nyVals),
      maxNy: result.maxNy ?? safeMax(nyVals),
      minNxy: result.minNxy ?? safeMin(nxyVals),
      maxNxy: result.maxNxy ?? safeMax(nxyVals),
      crX: result.crX,
      crY: result.crY,
    };
  }

  let femGen = 0;

  function currentSlabIds(): Set<string> {
    return new Set(model.slabs.filter(s => s.vertices.length >= 3).map(s => s.id));
  }

  async function triggerFEMAnalysis(): Promise<void> {
    const validSlabs = model.slabs.filter((s: SlabPolygon) => s.vertices.length >= 3);
    if (validSlabs.length === 0) return;
    const gen = ++femGen;
    const slabIdsAtStart = currentSlabIds();

    femState.setComputing();
    uiState.setShowFEMResults(true);

    const columns = model.columns;
    const walls = [...model.walls, ...model.polylineWalls.map((pw: any) => {
      const segs: ShearWallElement[] = [];
      for (let i = 0; i < pw.vertices.length - 1; i++) {
        segs.push({
          id: `${pw.id}_${i}`, startPoint: pw.vertices[i], endPoint: pw.vertices[i + 1],
          thickness: pw.thickness, height: pw.height, elasticModulus: pw.elasticModulus,
          shearModulus: pw.shearModulus, concreteDensity: pw.concreteDensity,
          label: pw.label, boundaryCondition: pw.boundaryCondition
        });
      }
      return segs;
    }).flat()];

    const allWalls = walls.filter(w => w.startPoint && w.endPoint);
    let meshSize = uiState.femMeshSize;

    // Adaptive Node/Mesh Guard: clamp mesh size based on slab area to prevent solver timeouts
    const maxNodes = apiAvailable ? 5000 : 1000;
    for (const slab of validSlabs) {
      if (slab.vertices.length >= 3) {
        const xs = slab.vertices.map(v => v.x);
        const ys = slab.vertices.map(v => v.y);
        const bboxWidth = Math.max(...xs) - Math.min(...xs);
        const bboxHeight = Math.max(...ys) - Math.min(...ys);
        const slabArea = bboxWidth * bboxHeight;
        // Limit total estimated nodes = slabArea / (meshSize^2) to maxNodes
        const minSafeMeshSize = Math.max(0.15, Math.sqrt(slabArea / maxNodes));
        if (meshSize < minSafeMeshSize) {
          meshSize = minSafeMeshSize;
        }
      }
    }

    // ── Primary: OpenSeesPy backend (default when connected — fast & accurate) ──
    if (apiAvailable) {
      try {
        await meshAndAnalyzeBackend(validSlabs, allWalls, columns, meshSize, gen, slabIdsAtStart);
        if (gen !== femGen) return;
        return; // backend result is authoritative
      } catch (e) {
        const msg = e instanceof PyApiError ? e.message : String(e);
        console.warn(`[Reslo] OpenSeesPy failed: ${msg}`);
        femState.setError(`OpenSeesPy Solver Failed: ${msg}`);
        uiState.setStatusMessage(`OpenSeesPy failed: ${msg}`);
        return; // Do not fall back to in-browser solver if OpenSeesPy is connected
      }
    }

    // ── Fallback: in-browser Web Worker solver (no install, instant, lag-free) ──
    // Runs automatically when the backend is offline so the app still works as a pure website.
    try {
      await runWorkerSolver(validSlabs, columns, allWalls, meshSize, gen, slabIdsAtStart);
      if (gen !== femGen) return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      femState.setError(`Solver failed: ${msg}`);
      uiState.setStatusMessage(`Solver error: ${msg}`);
    }
  }

  // Non-blocking backend upgrade: refines results with OpenSeesPy when available/fast.
  async function meshAndAnalyzeBackend(
    validSlabs: SlabPolygon[], allWalls: ShearWallElement[], columns: ColumnElement[],
    meshSize: number, gen: number, slabIdsAtStart: Set<string>
  ): Promise<void> {
    const allResults: SlabFEMResult[] = [];
    const allWarnings: string[] = [];
    const allDisconnected: string[] = [];
    for (let i = 0; i < validSlabs.length; i++) {
      const slab = validSlabs[i];
      femState.setProgress(i / validSlabs.length);
      femState.refreshTimeout();
      const res = await meshAndAnalyze(
        slab, allWalls, columns, meshSize, 0.2, model.beams, model.dropPanels,
        model.nonStructuralWalls, model.polylineNonStructuralWalls
      );
      allResults.push(toFrontendResult(slab.id, res.mesh, res.result, meshSize));
      if (res.warnings.length > 0) allWarnings.push(...res.warnings);
      if (res.disconnectedIds.length > 0) allDisconnected.push(...res.disconnectedIds);
    }
    femState.setProgress(1);
    if (gen !== femGen) return; // a newer analysis superseded this one
    const stillValid = allResults.filter(r => slabIdsAtStart.has(r.slabId) && model.slabs.some(s => s.id === r.slabId));
    if (stillValid.length === 0) return;
    femState.setResults(stillValid);
    femState.warnings = allWarnings;
    femState.disconnectedIds = new Set(allDisconnected);
    const elemCount = stillValid.reduce((s, r) => s + r.mesh.elements.length, 0);
    uiState.setStatusMessage(`FEM (OpenSeesPy): ${stillValid.length} slab(s), ${elemCount} elements`);
    memoryStore.pushSolve({ solver: 'openseespy', slabCount: stillValid.length, elementCount: elemCount, durationMs: 0, success: true, warnings: allWarnings });
  }

  function runWorkerSolver(validSlabs: SlabPolygon[], columns: ColumnElement[], walls: ShearWallElement[], meshSize: number, gen: number, slabIdsAtStart: Set<string>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!worker) {
          worker = new Worker(new URL('./workers/fem.worker.ts', import.meta.url), { type: 'module' });
        }
        worker.onerror = (err) => {
          worker = null;
          reject(new Error(`Worker error: ${err.message}`));
        };
        worker.onmessage = (event: MessageEvent<FEMWorkerOutput>) => {
          const data = event.data;
          if (data.type === 'PROGRESS') {
            femState.setProgress(data.progress ?? 0);
          } else if (data.type === 'RESULT') {
            if (gen !== femGen) { resolve(); return; }
            const results = (data.results ?? []).filter(r => slabIdsAtStart.has(r.slabId) && model.slabs.some(s => s.id === r.slabId));
            if (results.length === 0) {
              femState.clear();
              uiState.setStatusMessage('Analysis cleared - slab deleted');
              resolve();
              return;
            }
            femState.setResults(results);
            const count = results.length;
            const elems = results.reduce((s, r) => s + r.mesh.elements.length, 0);
            uiState.setStatusMessage(`FEM (TS): ${count} slab(s), ${elems} elements`);
            memoryStore.pushSolve({ solver: 'worker', slabCount: count, elementCount: elems, durationMs: 0, success: true, warnings: [] });
            resolve();
          } else if (data.type === 'ERROR') {
            reject(new Error(data.error ?? 'Unknown worker error'));
          }
        };
        const input: FEMWorkerInput = JSON.parse(JSON.stringify({
          type: 'ANALYZE', slabs: validSlabs, columns, walls,
          polylineWalls: model.polylineWalls, beams: model.beams, dropPanels: model.dropPanels,
          nonStructuralWalls: model.nonStructuralWalls, polylineNonStructuralWalls: model.polylineNonStructuralWalls,
          meshSize, poissonRatio: 0.2, useQ8: false
        }));
        worker.postMessage(input);
      } catch (e) { reject(e); }
    });
  }

  function handleRunFEM(): void { triggerFEMAnalysis(); }

  function toggleGraphViewer(): void {
    graphStore.showGraphViewer = !graphStore.showGraphViewer;
    if (graphStore.showGraphViewer) graphStore.refresh();
  }

  let calibDistance = $state('10');

  function submitCalibration(): void {
    const data = uiState.calibrationPendingData;
    if (!data) return;
    const len = parseFloat(calibDistance);
    if (isNaN(len) || len <= 0) {
      uiState.setStatusMessage('Invalid distance — enter a positive number');
      return;
    }
    try {
      model.calibrator.setFromTwoPoints(data.p1Screen, data.p2Screen, len, model.canvasZoom);
      model.setCalibrated();
      const ppm = model.calibrator.pixelsPerMeter;
      const scaleLabel = computeScaleLabel(ppm);
      uiState.setStatusMessage(`Calibrated: ${ppm.toFixed(2)} px/m (${scaleLabel})`);
      uiState.showCalibrationDialog = false;
      uiState.calibrationPendingData = null;
      uiState.setTool('select');
    } catch (err) {
      uiState.setStatusMessage(`Calibration error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  $effect(() => {
    if (typeof window !== 'undefined') {
      uiState.initPanels(window.innerWidth, window.innerHeight);
    }
  });

  // AI Loop Engine + Perf Probe
  $effect(() => {
    startPerfProbe((fps, frameTime) => {
      if (typeof window !== 'undefined') {
        (window as any).__resloPerf = { fps, frameTime, dirty: true };
      }
    });
    return () => { perfProbeStop(); };
  });

  function handleResize(): void {
    if (typeof window !== 'undefined') {
      uiState.initPanels(window.innerWidth, window.innerHeight);
    }
  }
</script>

<div class="flex h-screen w-screen overflow-hidden bg-[#000000] {uiState.theme === 'light' ? 'light-theme' : ''}">
  <div class="sidebar flex flex-col w-[220px] shrink-0 border-r border-[#222222] bg-[#000000]">
    <!-- Scrollable top section -->
    <div class="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto">
      <div class="text-sm font-bold text-[#D62430] tracking-tight mb-1 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <img src="/reslo-logo.png" alt="Reslo" class="h-6" />
          <button
            onclick={() => { uiState.theme = uiState.theme === 'dark' ? 'light' : 'dark'; }}
            class="theme-toggle text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded cursor-pointer"
            title={uiState.theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {#if uiState.theme === 'dark'}
              <svg class="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 2.293a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zm2.121 4.471a1 1 0 10-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM10 14a4 4 0 100-8 4 4 0 000 8zm-7.071-7.07a1 1 0 011.414-1.414l.707.707A1 1 0 013.636 7.636l-.707-.707zM3 10a1 1 0 011-1h1a1 1 0 110 2H4a1 1 0 01-1-1zm2.293 4.293a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zM14 16.707a1 1 0 011.414-1.414l.707.707a1 1 0 01-1.414 1.414l-.707-.707zM8.94 13.06a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            {:else}
              <svg class="w-3.5 h-3.5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            {/if}
          </button>
        </div>
        <button
          class="rounded px-2 py-0.5 text-[9px] font-bold uppercase transition-colors cursor-pointer border
            {uiState.femAutoCompute 
              ? 'bg-[#D62430] border-[#D62430] text-white hover:bg-[#B01E28]' 
              : 'bg-[#1a1a1a] border-[#333333] text-[#ffffff] hover:bg-[#D62430]'}"
          class:active={uiState.femAutoCompute}
          onclick={() => { 
            uiState.femAutoCompute = !uiState.femAutoCompute;
            if (uiState.femAutoCompute) {
              triggerFEMAnalysis();
            } else {
              femState.clear();
              uiState.setShowFEMResults(false);
            }
          }}
        >
          {uiState.femAutoCompute ? '● Live On' : '○ Live Off'}
        </button>
      </div>
      <!-- Compact widget buttons: Reset View, Clear All, Save, Load -->
      <div class="flex gap-1">
        <button
          onclick={() => { model.resetView(); uiState.setStatusMessage('View reset'); }}
          class="flex-1 rounded bg-[#1a1a1a] py-1 text-[9px] text-[#ffffff] hover:bg-[#D62430] transition-colors cursor-pointer"
          title="Reset view zoom/pan"
        >Reset View</button>
        <button
          onclick={() => { model.resetModel(); uiState.setStatusMessage('Model cleared'); }}
          class="flex-1 rounded bg-[#1a1a1a] py-1 text-[9px] text-[#ffffff] hover:bg-[#D62430] transition-colors cursor-pointer"
          title="Clear all elements"
        >Clear All</button>
        <button
          onclick={() => model.saveToFile()}
          class="flex-1 rounded bg-[#1a1a1a] py-1 text-[9px] text-[#ffffff] hover:bg-[#D62430] transition-colors cursor-pointer"
          title="Save project (Ctrl+S)"
        >Save</button>
        <button
          onclick={() => document.getElementById('project-file-input')?.click()}
          class="flex-1 rounded bg-[#1a1a1a] py-1 text-[9px] text-[#ffffff] hover:bg-[#D62430] transition-colors cursor-pointer"
          title="Open .9e project file"
        >Open</button>
      </div>
      <div class="flex items-center gap-1 px-1">
        <label class="text-[9px] text-[#888888] shrink-0">Project:</label>
        <input
          type="text"
          value={model.projectName}
          oninput={(e) => { model.projectName = (e.target as HTMLInputElement).value || 'project'; }}
          class="flex-1 rounded bg-[#1a1a1a] border border-[#333333] px-1.5 py-0.5 text-[10px] text-[#ffffff] focus:border-[#D62430] focus:outline-none"
          placeholder="Project name"
        />
      </div>
      <ImageUploader />
      <button
        onclick={() => uiState.showExportDialog = true}
        class="w-full rounded bg-[#D62430] py-1.5 text-xs text-white hover:bg-[#B01E28] transition-colors border border-[#D62430]"
      >Export</button>
      
      <!-- FEM Settings Panel (Mesh Size control) -->
      <div class="sidebar-panel flex flex-col gap-1.5 rounded-lg bg-[#1a1a1a] p-2 border border-[#333333] mt-0.5">
        <div class="text-[10px] font-bold text-[#ffffff] uppercase tracking-wider px-1">FEM Settings</div>
        <div class="flex items-center justify-between px-1">
          <label class="text-[9px] text-slate-400">Mesh Size:</label>
          <span class="text-[9px] font-mono text-white">{uiState.femMeshSize.toFixed(2)}m</span>
        </div>
        <input
          type="range"
          min="0.15"
          max="2.0"
          step="0.05"
          value={uiState.femMeshSize}
          oninput={(e) => { uiState.femMeshSize = parseFloat(e.currentTarget.value); if (uiState.femAutoCompute) triggerFEMAnalysis(); }}
          class="w-full accent-[#D62430] cursor-pointer h-1.5 bg-[#333333] rounded-lg appearance-none"
        />
      </div>

      <input
        id="project-file-input"
        type="file"
        accept=".9e,application/json"
        class="hidden"
        onchange={(e) => { const input = e.currentTarget as HTMLInputElement; const file = input.files?.[0]; if (file) { model.loadFromFile(file).then(() => { uiState.setStatusMessage('Project loaded'); }).catch(err => { uiState.setStatusMessage('Load error: ' + err.message); }); input.value = ''; } }}
      />
      {#if uiState.viewMode === '2d'}
        <Toolbar />
      {/if}
      {#if uiState.tool === 'column'}
        <ColumnPlacementPanel />
      {/if}
    </div>

    <!-- Fixed bottom section -->
    <div class="p-2.5 border-t border-[#222222] bg-[#0c0c0c] flex flex-col gap-1 shrink-0">
      <div class="text-[10px] font-bold text-[#888888] uppercase tracking-wider px-1">Calculation Engine</div>
      <div class="flex items-center gap-1.5 px-1 py-0.5">
        <span class="w-1.5 h-1.5 rounded-full {uiState.backendConnected ? 'bg-green-500 shadow-[0_0_6px_#10b981]' : 'bg-yellow-500 shadow-[0_0_6px_#f59e0b]'}"></span>
        <span class="text-[9px] text-slate-300 font-medium">
          {uiState.backendConnected ? 'OpenSeesPy Connected' : 'Local Solver Fallback'}
        </span>
      </div>
    </div>
  </div>

  {#if uiState.viewMode === '3d'}
    <div class="flex flex-1 flex-col min-w-0">
      <div class="flex-1 min-h-0 overflow-hidden rounded bg-[#1a1a1a]">
        <ThreeViewport />
      </div>
      <div class="flex items-center justify-between px-4 py-1.5 bg-[#1a1a1a] border-t border-[#333333] text-[11px] text-[#ffffff]">
        <span>{uiState.statusMessage}</span>
        <span class="flex items-center gap-3 font-mono">
          <span class="text-[#D62430]">3D View</span>
          {#if femState.hasResults}
            <span>Max defl: <span class="text-[#D62430]">{(femState.globalMinWz * 1000).toFixed(2)} mm</span></span>
          {/if}
        </span>
      </div>
    </div>
  {:else}
    <div class="flex flex-1 flex-col relative">
      <WorkspaceCanvas />

      {#if femState.hasResults}
        <div class="absolute bottom-[80px] left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-1.5 p-1 rounded-lg border border-[#2b2b2b] bg-[#141414]/90 backdrop-blur-md shadow-2xl">
          {#each ['deflection', 'mx', 'my', 'mxy', 'punching'] as type}
            {#if type !== 'punching' || (femState.activeResult?.columnPunching?.length ?? 0) > 0}
              <button
                class="px-3 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-all duration-200 cursor-pointer text-center border border-transparent
                  {femState.showFEMContour && femState.resultType === type
                    ? 'bg-[#D62430] text-white shadow-[0_0_8px_rgba(214,36,48,0.4)] border-[#D62430]'
                    : 'bg-[#1e1e1e]/85 text-[#b3b3b3] border-[#2b2b2b] hover:bg-[#333333] hover:text-white'}"
                onclick={() => {
                  if (femState.showFEMContour && femState.resultType === type) {
                    femState.showFEMContour = false;
                  } else {
                    femState.resultType = type as any;
                    femState.showFEMContour = true;
                  }
                }}
              >
                {type === 'deflection' ? 'Deflection' : type === 'mx' ? 'Moment Mx' : type === 'my' ? 'Moment My' : type === 'mxy' ? 'Moment Mxy' : 'Punching'}
              </button>
            {/if}
          {/each}
        </div>
      {/if}

      <div class="flex items-center justify-between px-4 py-1.5 bg-[#1a1a1a] border-t border-[#333333] text-[11px] text-[#ffffff] z-10">
        <span>{uiState.statusMessage}</span>
        <span class="flex items-center gap-3 font-mono">
          <button
            onclick={toggleGraphViewer}
            class="flex items-center gap-1.5 rounded bg-[#333333] px-2 py-1 hover:bg-[#D62430] transition-colors cursor-pointer"
            title="View graph state"
          >
            <span class="inline-block h-2 w-2 rounded-full {headroomColor()}"></span>
            <span>{graphStore.report?.tokens ?? '—'} tok</span>
            <span class="text-[10px] text-[#ffffff]">L{graphStore.report?.compression ?? 0}</span>
          </button>
          <span>{(model.canvasZoom * 100).toFixed(0)}%</span>
          <span>{model.calibrator.pixelsPerMeter.toFixed(1)} px/m</span>
        </span>
      </div>
    </div>

    {#if floorLayers.layers.length > 0}
      <LayersPanel />
    {/if}
    <PropertiesPanel />

    <ContextMenu />
    <GraphViewer />
  {/if}

  <div class="absolute right-3 top-3 flex flex-col gap-3 pointer-events-none z-10">
    <div class="pointer-events-auto"><MetricsHUD /></div>
  </div>

  <div class="absolute right-3 bottom-3 pointer-events-auto z-10">
    <InsightPanel />
  </div>

  <div class="absolute left-1/2 -translate-x-1/2 top-3 pointer-events-none z-20 flex gap-2">
    <div class="pointer-events-auto flex rounded-lg overflow-hidden border border-[#333333] shadow-lg">
      <button
        class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer {uiState.viewMode === '2d' ? 'bg-[#D62430] text-white' : 'bg-[#1a1a1a] text-[#ffffff] hover:bg-[#333333]'}"
        onclick={() => uiState.viewMode = '2d'}
      >Plan</button>
      <button
        class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer {uiState.viewMode === '3d' ? 'bg-[#D62430] text-white' : 'bg-[#1a1a1a] text-[#ffffff] hover:bg-[#333333]'}"
        onclick={() => uiState.viewMode = '3d'}
      >3D</button>
    </div>

    {#if uiState.viewMode === '3d' && model.planImage}
      <div class="pointer-events-auto flex rounded-lg overflow-hidden border border-[#333333] shadow-lg">
        <button
          class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer {uiState.show3DPlanOverlay ? 'bg-[#D62430] text-white' : 'bg-[#1a1a1a] text-[#ffffff] hover:bg-[#333333]'}"
          onclick={() => uiState.show3DPlanOverlay = !uiState.show3DPlanOverlay}
        >
          {uiState.show3DPlanOverlay ? 'Hide Tracing Plan' : 'Show Tracing Plan'}
        </button>
      </div>
    {/if}
  </div>
</div>

<svelte:window 
  onkeydown={(e) => { if (e.key === 'Escape' && uiState.showExportDialog) uiState.showExportDialog = false; if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); model.saveToFile(); } }} 
  onresize={handleResize}
/>

{#if uiState.showCalibrationDialog && uiState.calibrationPendingData}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={() => { uiState.showCalibrationDialog = false; uiState.calibrationPendingData = null; }}
  >
    <div
      class="rounded-lg bg-[#1a1a1a] border border-[#333333] p-5 shadow-xl w-72"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="text-sm font-bold text-[#ffffff] mb-3">Calibration</div>
      <div class="text-xs text-[#ffffff] mb-3">Enter the actual distance between the two points you placed (in meters):</div>
      <form onsubmit={(e) => { e.preventDefault(); submitCalibration(); }} class="flex flex-col gap-3">
        <input
          type="number"
          step="any"
          min="0.001"
          bind:value={calibDistance}
          autofocus
          class="w-full rounded bg-[#333333] px-3 py-2 text-sm text-white border border-[#444444] focus:border-[#D62430] focus:outline-none"
          placeholder="Distance (m)"
        />
        <div class="flex gap-2">
          <button
            type="submit"
            class="flex-1 rounded bg-[#D62430] py-2 text-sm text-white hover:bg-[#B01E28] transition-colors"
          >Apply</button>
          <button
            type="button"
            onclick={() => { uiState.showCalibrationDialog = false; uiState.calibrationPendingData = null; }}
            class="flex-1 rounded bg-[#333333] py-2 text-sm text-white hover:bg-[#444444] transition-colors"
          >Cancel</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if uiState.showExportDialog}
  <ExportDialog />
{/if}

{#if femState.isComputing}
  <div class="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-[#333333] bg-[#141414] p-4 shadow-2xl flex items-center gap-3 text-left pointer-events-auto">
    <!-- Premium Spinner -->
    <div class="relative w-8 h-8 shrink-0">
      <div class="absolute inset-0 rounded-full border-3 border-[#222222]"></div>
      <div class="absolute inset-0 rounded-full border-3 border-t-[#D62430] animate-spin"></div>
    </div>
    <div class="flex-1 flex flex-col gap-0.5 overflow-hidden">
      <div class="text-[10px] font-bold text-white uppercase tracking-wider">Solving FEM Model</div>
      {#if femState.progress > 0}
        <div class="w-full flex items-center gap-1.5 mt-0.5">
          <div class="flex-1 h-1 rounded-full bg-[#222222] overflow-hidden">
            <div class="h-full bg-[#D62430] transition-all duration-300" style="width: {femState.progress * 100}%"></div>
          </div>
          <span class="text-[8px] font-mono text-slate-500 shrink-0">{(femState.progress * 100).toFixed(0)}%</span>
        </div>
      {:else}
        <div class="text-[9px] text-slate-400 truncate">Running analysis equations...</div>
      {/if}
    </div>
  </div>
{/if}

{#if femState.error}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-96 rounded-xl border border-red-950 bg-[#161011] p-6 shadow-2xl flex flex-col gap-4 text-center items-center">
      <!-- Warning Icon -->
      <div class="w-12 h-12 rounded-full bg-red-950/50 flex items-center justify-center border border-red-800 text-red-500">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div class="flex flex-col gap-2 w-full">
        <div class="text-xs font-bold text-red-400 uppercase tracking-wider">Analysis Failed</div>
        <div class="text-[10px] text-slate-300 leading-relaxed font-medium bg-[#0f0a0a] p-3 rounded-lg border border-red-950/50 text-left max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
          {femState.error}
        </div>
      </div>
      <button
        onclick={() => { femState.error = null; }}
        class="w-full rounded bg-[#D62430] py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#B01E28] transition-colors cursor-pointer border border-[#D62430]"
      >
        Dismiss
      </button>
    </div>
  </div>
{/if}
