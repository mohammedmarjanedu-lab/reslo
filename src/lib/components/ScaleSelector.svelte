<script lang="ts">
  import { STANDARD_SCALES, computeScaleLabel } from '../engine/scaleCalibrator';
  import { model } from '../stores/structuralModel.svelte';
  import { uiState } from '../stores/uiState.svelte';

  let selectedScale = $state<number>(100);
  let manualPPM = $state<string>('');
  let scaleMode = $state<'standard' | 'manual' | 'calibrate'>('standard');
  let calibLengthInput = $state<string>('10');

  function applyStandardScale(): void {
    model.calibrator.setFromScale(selectedScale);
    model.setCalibrated();
    const ppm = model.pixelsPerMeter;
    uiState.setStatusMessage(`Scale set to 1:${selectedScale} (${ppm.toFixed(2)} px/m, ${computeScaleLabel(ppm)})`);
  }

  function applyManualPPM(): void {
    const val = parseFloat(manualPPM);
    if (!isNaN(val) && val > 0) {
      model.pixelsPerMeter = val;
      model.setCalibrated();
      const ppm = model.pixelsPerMeter;
      uiState.setStatusMessage(`Scale set to ${val.toFixed(2)} px/m (${computeScaleLabel(ppm)})`);
    }
  }

  function startCalibration(): void {
    uiState.setMode('calibrate');
    uiState.setCalibrationPoint1(null);
    uiState.setStatusMessage('Click first point on canvas for calibration');
  }
</script>

<div class="flex flex-col gap-2 rounded-lg bg-slate-800 p-3 border border-slate-700">
  <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Scale</div>

  <div class="flex gap-1">
    {#each (['standard', 'manual', 'calibrate'] as const) as m}
      <button
        class="flex-1 rounded px-2 py-1 text-xs transition-colors
          {scaleMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}"
        onclick={() => { scaleMode = m; }}
      >
        {m === 'standard' ? 'Preset' : m === 'manual' ? 'Custom' : 'Line'}
      </button>
    {/each}
  </div>

  {#if scaleMode === 'standard'}
    <select
      bind:value={selectedScale}
      onchange={applyStandardScale}
      class="rounded bg-slate-700 px-2 py-1.5 text-sm text-white border border-slate-600"
    >
      {#each STANDARD_SCALES as scale}
        <option value={scale.ratio}>{scale.label}</option>
      {/each}
    </select>

  {:else if scaleMode === 'manual'}
    <div class="flex gap-2">
      <input
        type="number"
        bind:value={manualPPM}
        placeholder="px/m"
        class="flex-1 rounded bg-slate-700 px-2 py-1.5 text-sm text-white border border-slate-600 w-20"
      />
      <button
        onclick={applyManualPPM}
        class="rounded bg-indigo-600 px-3 text-sm text-white hover:bg-indigo-500"
      >Set</button>
    </div>

  {:else}
    <div class="flex flex-col gap-2">
      <div class="flex gap-2 items-center">
        <input
          type="number"
          bind:value={calibLengthInput}
          placeholder="Length (m)"
          class="flex-1 rounded bg-slate-700 px-2 py-1.5 text-sm text-white border border-slate-600 w-16"
        />
        <span class="text-xs text-slate-400">m</span>
      </div>
      <button
        onclick={startCalibration}
        class="rounded bg-purple-700 py-1.5 text-sm text-white hover:bg-purple-600 transition-colors"
      >Start Calibration</button>
    </div>
  {/if}

  <div class="flex items-center justify-between text-xs">
    <span class="font-mono text-slate-400">{model.pixelsPerMeter.toFixed(2)} px/m</span>
    <span class="flex items-center gap-1 {model.isCalibrated ? 'text-green-400' : 'text-amber-400'}">{model.calibratedLabel}</span>
  </div>
</div>
