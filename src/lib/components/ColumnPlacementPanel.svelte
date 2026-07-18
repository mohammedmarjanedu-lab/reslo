<script lang="ts">
  import { uiState } from '../stores/uiState.svelte';

  const WIDTH_PRESETS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
  const DEPTH_PRESETS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
  const DIAMETER_PRESETS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
  const HEIGHT_PRESETS = [2000, 2500, 2700, 3000, 3200, 3500, 4000, 4500, 5000];

  function onWidthSelect(e: Event): void {
    const val = parseInt((e.target as HTMLSelectElement).value);
    if (!isNaN(val) && val > 0) uiState.placementWidth = val;
  }

  function onDepthSelect(e: Event): void {
    const val = parseInt((e.target as HTMLSelectElement).value);
    if (!isNaN(val) && val > 0) uiState.placementDepth = val;
  }

  function onDiameterSelect(e: Event): void {
    const val = parseInt((e.target as HTMLSelectElement).value);
    if (!isNaN(val) && val > 0) uiState.placementDiameter = val;
  }

  function onHeightChange(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) uiState.placementHeight = val;
  }

  function setShape(shape: 'rectangular' | 'circular'): void {
    uiState.columnShape = shape;
  }
</script>

<div class="sidebar-panel flex flex-col gap-2 rounded-lg bg-[#1a1a1a] border border-[#333333] p-2.5 text-xs">
  <div class="text-[10px] uppercase tracking-wider text-[#ffffff] font-medium mb-0.5">Column Shape</div>
  <div class="grid grid-cols-2 gap-1 mb-1.5">
    <button
      onclick={() => setShape('rectangular')}
      class="py-1 rounded text-center font-medium border text-[10px] transition-colors
        {uiState.columnShape === 'rectangular' 
          ? 'bg-[#D62430] border-[#D62430] text-white' 
          : 'bg-[#1a1a1a] border-[#333333] text-[#ffffff] hover:bg-[#D62430] hover:text-white hover:border-[#D62430]'}"
    >
      Rectangular
    </button>
    <button
      onclick={() => setShape('circular')}
      class="py-1 rounded text-center font-medium border text-[10px] transition-colors
        {uiState.columnShape === 'circular' 
          ? 'bg-[#D62430] border-[#D62430] text-white' 
          : 'bg-[#1a1a1a] border-[#333333] text-[#ffffff] hover:bg-[#D62430] hover:text-white hover:border-[#D62430]'}"
    >
      Circular
    </button>
  </div>

  {#if uiState.columnShape === 'circular'}
    <div>
      <label class="block text-[#ffffff] mb-0.5">Diameter D (mm)</label>
      <select
        value={uiState.placementDiameter}
        onchange={onDiameterSelect}
        class="w-full rounded bg-[#333333] px-2 py-1.5 text-white border border-[#444444] text-xs"
      >
        {#each DIAMETER_PRESETS as v}
          <option value={v}>{v}</option>
        {/each}
      </select>
    </div>
  {:else}
    <div>
      <label class="block text-[#ffffff] mb-0.5">Width b (mm)</label>
      <select
        value={uiState.placementWidth}
        onchange={onWidthSelect}
        class="w-full rounded bg-[#333333] px-2 py-1.5 text-white border border-[#444444] text-xs"
      >
        {#each WIDTH_PRESETS as v}
          <option value={v}>{v}</option>
        {/each}
      </select>
    </div>

    <div>
      <label class="block text-[#ffffff] mb-0.5">Depth h (mm)</label>
      <select
        value={uiState.placementDepth}
        onchange={onDepthSelect}
        class="w-full rounded bg-[#333333] px-2 py-1.5 text-white border border-[#444444] text-xs"
      >
        {#each DEPTH_PRESETS as v}
          <option value={v}>{v}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>

<div class="sidebar-panel flex flex-col gap-2 rounded-lg bg-[#1a1a1a] border border-[#333333] p-2.5 text-xs">
  <div class="text-[10px] uppercase tracking-wider text-[#ffffff] font-medium mb-0.5">Floor Height (mm)</div>
  <div>
    <label class="block text-[#ffffff] mb-0.5">Uniform height H</label>
    <input type="number" min="1" max="20000" step="100" value={uiState.placementHeight}
      oninput={onHeightChange}
      list="preset-height"
      class="w-full rounded bg-[#333333] px-2 py-1.5 text-white border border-[#444444] text-xs"
    />
    <datalist id="preset-height">
      {#each HEIGHT_PRESETS as v}
        <option value={v}></option>
      {/each}
    </datalist>
  </div>
</div>
