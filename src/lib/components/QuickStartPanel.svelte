<script lang="ts">
  import { uiState } from '../stores/uiState.svelte';
  import { model } from '../stores/structuralModel.svelte';

  let show = $state(true);

  function dismiss() { show = false; }

  function startWithGuide() {
    show = false;
    uiState.setTool('calibrate');
    uiState.setStatusMessage('Step 1: Set scale by clicking two known points on your image/PDF');
  }
</script>

{#if show}
  <div class="rounded-lg bg-indigo-900/60 border border-indigo-500/40 p-3 text-xs shadow-lg backdrop-blur-sm">
    <div class="flex items-center justify-between mb-2">
      <span class="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Quick Start</span>
      <button onclick={dismiss} class="text-indigo-400 hover:text-white text-[10px] px-1">&times;</button>
    </div>
    <div class="space-y-1.5 text-indigo-200">
      <p class="flex items-center gap-1.5">
        <span class="inline-flex items-center justify-center h-4 w-4 rounded-full bg-indigo-600 text-[9px] font-bold text-white">1</span>
        <span>Calibrate scale (<kbd class="bg-indigo-800 px-1 rounded text-indigo-200 text-[9px]">L</kbd>) — click two points with known distance</span>
      </p>
      <p class="flex items-center gap-1.5">
        <span class="inline-flex items-center justify-center h-4 w-4 rounded-full bg-indigo-600 text-[9px] font-bold text-white">2</span>
        <span>Draw columns (<kbd class="bg-indigo-800 px-1 rounded text-indigo-200 text-[9px]">C</kbd>), walls (<kbd class="bg-indigo-800 px-1 rounded text-indigo-200 text-[9px]">W</kbd>), slabs (<kbd class="bg-indigo-800 px-1 rounded text-indigo-200 text-[9px]">S</kbd>)</span>
      </p>
      <p class="flex items-center gap-1.5">
        <span class="inline-flex items-center justify-center h-4 w-4 rounded-full bg-indigo-600 text-[9px] font-bold text-white">3</span>
        <span>Run FEM analysis — click <span class="text-indigo-300 font-medium">"Run FEM"</span> in the panel below</span>
      </p>
      <p class="flex items-center gap-1.5">
        <span class="inline-flex items-center justify-center h-4 w-4 rounded-full bg-indigo-600 text-[9px] font-bold text-white">4</span>
        <span>Toggle contour, 3D view, and check punching stress at columns</span>
      </p>
    </div>
    <div class="mt-2 flex gap-2">
      <button onclick={startWithGuide} class="flex-1 rounded bg-indigo-600 py-1.5 text-[10px] text-white hover:bg-indigo-500 transition-colors">
        Start Guide
      </button>
      <button onclick={dismiss} class="flex-1 rounded bg-slate-700 py-1.5 text-[10px] text-slate-300 hover:bg-slate-600 transition-colors">
        Skip
      </button>
    </div>
  </div>
{/if}
