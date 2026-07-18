<script lang="ts">
  import { femState } from '../stores/femResults.svelte';
  import { uiState } from '../stores/uiState.svelte';
  import { model } from '../stores/structuralModel.svelte';
  import type { FEMResultType } from '../engine/types';

  const resultTypes: { value: FEMResultType; label: string; unit: string }[] = [
    { value: 'deflection', label: 'Deflection', unit: 'mm' },
    { value: 'mx', label: 'Moment Mx', unit: 'kN·m/m' },
    { value: 'my', label: 'Moment My', unit: 'kN·m/m' },
    { value: 'mxy', label: 'Moment Mxy', unit: 'kN·m/m' },
    { value: 'stress_s1', label: 'Principal σ₁', unit: 'kPa' },
    { value: 'stress_s2', label: 'Principal σ₂', unit: 'kPa' },
    { value: 'stress_vm', label: 'Von Mises σ', unit: 'kPa' },
    { value: 'punching', label: 'Punching', unit: 'ratio' },
  ];

  function handleResultTypeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    femState.resultType = target.value as FEMResultType;
  }

  function handleAutoComputeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    uiState.femAutoCompute = target.checked;
  }

  function handleMeshSizeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    uiState.femMeshSize = parseFloat(target.value);
  }

  function handleDeformedScaleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    femState.deformedScale = parseFloat(target.value);
  }

  let { onrunFem }: { onrunFem?: () => void } = $props();

  function handleRunFEM() {
    uiState.setShowFEMResults(true);
    onrunFem?.();
  }

  function getCurrentMinMax(): { min: number; max: number } {
    switch (femState.resultType) {
      case 'deflection': {
        const a = Math.abs(femState.globalMinWz) * 1000;
        const b = Math.abs(femState.globalMaxWz) * 1000;
        return { min: Math.min(a, b), max: Math.max(a, b) };
      }
      case 'mx': return { min: femState.globalMinMx, max: femState.globalMaxMx };
      case 'my': return { min: femState.globalMinMy, max: femState.globalMaxMy };
      case 'mxy': {
        let min = Infinity, max = -Infinity;
        for (const r of femState.slabResults.values()) {
          for (const m of r.momentMxy) { if (m.value < min) min = m.value; if (m.value > max) max = m.value; }
        }
        return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
      }
      case 'stress_s1': case 'stress_s2': case 'stress_vm': {
        let min = Infinity, max = -Infinity;
        const key = femState.resultType === 'stress_s1' ? 's1' : femState.resultType === 'stress_s2' ? 's2' : 'vm';
        for (const r of femState.slabResults.values()) {
          for (const s of r.stresses) {
            const v = s[key as 's1' | 's2' | 'vm'];
            if (v < min) min = v; if (v > max) max = v;
          }
        }
        return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
      }
      case 'punching': {
        let maxRatio = 0;
        for (const r of femState.slabResults.values()) {
          for (const p of (r.columnPunching || [])) {
            if (p.ratio > maxRatio) maxRatio = p.ratio;
          }
        }
        return { min: 0, max: maxRatio };
      }
      default: return { min: 0, max: 0 };
    }
  }

  const mmRange = $derived(getCurrentMinMax());
  const elemCount = $derived.by(() => {
    let total = 0;
    for (const r of femState.slabResults.values()) total += r.mesh.elements.length;
    return total;
  });
  const dofCount = $derived.by(() => {
    let total = 0;
    for (const r of femState.slabResults.values()) total += r.mesh.nodes.length * 3;
    return total;
  });
</script>

<div class="rounded-lg bg-slate-800 border border-slate-700 p-3 shadow-lg w-[220px]">
  <div class="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">FEM Contour</div>

  {#if femState.isComputing}
    <div class="mb-2">
      <div class="flex justify-between text-[10px] text-slate-400 mb-1">
        <span>Computing...</span>
        <span>{(femState.progress * 100).toFixed(0)}%</span>
      </div>
      <div class="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div class="h-full rounded-full bg-indigo-500 transition-all" style="width: {femState.progress * 100}%"></div>
      </div>
    </div>
  {/if}

  {#if femState.error}
    <div class="mb-2 text-[10px] text-red-400 bg-red-900/30 rounded p-1.5">{femState.error}</div>
  {/if}

  <div class="flex flex-col gap-2">
    <!-- API URL Config -->
    <div class="border-b border-slate-700 pb-2 mb-1">
      <div class="flex items-center justify-between mb-1">
        <label class="block text-[10px] text-slate-500">API Endpoint URL</label>
        <span class="w-1.5 h-1.5 rounded-full {uiState.backendConnected ? 'bg-green-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500 shadow-[0_0_6px_#ef4444]'}"></span>
      </div>
      <input
        type="text"
        value={uiState.apiUrl}
        onchange={(e) => uiState.setApiUrl((e.target as HTMLInputElement).value)}
        placeholder="http://localhost:8000"
        class="w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-white font-mono text-[9px] focus:outline-none focus:border-indigo-500"
      />
    </div>

    <!-- Result Type -->
    <div>
      <label class="block text-[10px] text-slate-500 mb-0.5">Result Type</label>
      <select
        onchange={handleResultTypeChange}
        class="w-full rounded bg-slate-700 px-2 py-1 text-white text-[11px] border border-slate-600"
      >
        {#each resultTypes as rt}
          <option value={rt.value} selected={femState.resultType === rt.value}>
            {rt.label} ({rt.unit})
          </option>
        {/each}
      </select>
    </div>

    <!-- Auto Compute Toggle -->
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="fem-auto"
        checked={uiState.femAutoCompute}
        onchange={handleAutoComputeChange}
        class="accent-indigo-500"
      />
      <label for="fem-auto" class="text-[10px] text-slate-400">Auto Compute</label>
    </div>

    <!-- Mesh Size Slider -->
    <div>
      <label class="block text-[10px] text-slate-500 mb-0.5">
        Mesh Size: <span class="text-white font-mono">{uiState.femMeshSize.toFixed(1)}m</span>
      </label>
      <input
        type="range"
        min="0.2"
        max="2.0"
        step="0.1"
        value={uiState.femMeshSize}
        oninput={handleMeshSizeChange}
        class="w-full accent-indigo-500"
      />
    </div>

    <!-- Deformed Scale -->
    {#if femState.resultType === 'deflection'}
      <div>
        <label class="block text-[10px] text-slate-500 mb-0.5">
          Deform Scale: <span class="text-white font-mono">{femState.deformedScale}x</span>
        </label>
        <input
          type="range"
          min="5"
          max="200"
          step="5"
          value={femState.deformedScale}
          oninput={handleDeformedScaleChange}
          class="w-full accent-indigo-500"
        />
      </div>
    {/if}

    <!-- Toggles -->
    <label class="flex items-center gap-2 text-[10px] text-slate-400">
      <input type="checkbox" bind:checked={femState.showFEMContour} class="accent-indigo-500" />
      Show Contour
    </label>
    <label class="flex items-center gap-2 text-[10px] text-slate-400">
      <input type="checkbox" bind:checked={femState.showFEMMesh} class="accent-indigo-500" />
      Show Mesh
    </label>

    <!-- Run Button -->
    <button
      onclick={handleRunFEM}
      disabled={femState.isComputing || model.slabs.filter(s => s.vertices.length >= 3).length === 0}
      class="w-full rounded bg-indigo-700 py-1.5 text-xs text-white hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {femState.isComputing ? 'Computing...' : femState.hasResults ? 'Re-run Analysis' : 'Run Analysis'}
    </button>
  </div>

  <!-- Stats -->
  {#if femState.hasResults}
    <div class="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-500 font-mono">
      <div class="flex justify-between"><span>Elements</span><span class="text-slate-300">{elemCount}</span></div>
      <div class="flex justify-between"><span>DOF</span><span class="text-slate-300">{dofCount}</span></div>
      <div class="flex justify-between">
        <span>Min</span>
        <span class="text-blue-400">{mmRange.min.toFixed(3)}</span>
      </div>
      <div class="flex justify-between">
        <span>Max</span>
        <span class="text-red-400">{mmRange.max.toFixed(3)}</span>
      </div>
    </div>
  {/if}

  <!-- Connectivity Warnings -->
  {#if femState.warnings.length > 0}
    <div class="mt-2 pt-2 border-t border-amber-800/50">
      <div class="text-[10px] font-bold text-amber-400 mb-1 uppercase tracking-wider">
        ⚠ {femState.warnings.length} Warning{femState.warnings.length > 1 ? 's' : ''}
      </div>
      <div class="space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
        {#each femState.warnings as w}
          <div class="text-[9px] text-amber-200/80 bg-amber-900/20 border border-amber-800/30 rounded px-1.5 py-1 leading-tight">
            {w}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
