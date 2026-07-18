<script lang="ts">
  import { model } from '../stores/structuralModel.svelte';
  import { uiState } from '../stores/uiState.svelte';
  import { loadPlanFile } from '../imageUploader';

  let dragFileOver = $state(false);

  import { floorLayers } from '../stores/floorLayers.svelte';
  import { loadPDFPages } from '../imageUploader';
 
  async function handleFile(file: File): Promise<void> {
    try {
      uiState.setStatusMessage('Loading floor plans...');
      if (file.type === 'application/pdf') {
        const pages = await loadPDFPages(file);
        floorLayers.clearAll();
        let firstLayerId = '';
        for (let i = 0; i < pages.length; i++) {
          const id = floorLayers.addLayer(
            `${file.name} (Page ${i + 1})`,
            pages[i].imageData,
            pages[i].naturalWidth,
            pages[i].naturalHeight
          );
          if (i === 0) firstLayerId = id;
        }
        if (firstLayerId) {
          floorLayers.activeLayerId = firstLayerId;
          const active = floorLayers.layers.find(l => l.id === firstLayerId);
          if (active) {
            model.planImage = active.image as ImageBitmap;
            model.imageNaturalWidth = active.width;
            model.imageNaturalHeight = active.height;
          }
        }
        uiState.setStatusMessage(`Loaded PDF: ${file.name} (${pages.length} pages)`);
      } else {
        const plan = await loadPlanFile(file);
        floorLayers.clearAll();
        const id = floorLayers.addLayer(
          file.name,
          plan.imageData,
          plan.naturalWidth,
          plan.naturalHeight
        );
        floorLayers.activeLayerId = id;
        model.planImage = plan.imageData;
        model.imageNaturalWidth = plan.naturalWidth;
        model.imageNaturalHeight = plan.naturalHeight;
        uiState.setStatusMessage(`Loaded image: ${file.name}`);
      }
    } catch (err) {
      uiState.setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragFileOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  function onFileInput(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleFile(file);
    input.value = '';
  }
</script>

<div class="sidebar-panel rounded-lg bg-[#1a1a1a] p-3 border border-[#333333]">
  <button
    onclick={() => document.getElementById('file-input')?.click()}
    class="w-full rounded bg-[#1a1a1a] py-2 text-xs text-[#ffffff] hover:bg-[#D62430] transition-colors cursor-pointer border border-[#333333]"
  >
    {#if model.planImage}
      Plan loaded — click to replace
    {:else}
      + Plan Upload
    {/if}
  </button>

  <input
    id="file-input"
    type="file"
    accept=".pdf,image/png,image/jpeg,image/webp,image/tiff"
    class="hidden"
    onchange={onFileInput}
  />
</div>
