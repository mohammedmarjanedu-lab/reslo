<script lang="ts">
  import { uiState } from '../stores/uiState.svelte';
  import { model } from '../stores/structuralModel.svelte';

  function handleDelete(): void {
    if (uiState.selectedElementType === 'opening' && uiState.selectedElementId && uiState.selectedHoleIndex !== null) {
      model.deleteSlabHole(uiState.selectedElementId, uiState.selectedHoleIndex);
      uiState.setSelectedElements([]);
      uiState.selectedHoleIndex = null;
      uiState.setStatusMessage('Opening deleted');
    } else {
      const ids = uiState.selectedElementIds.length > 0
        ? uiState.selectedElementIds
        : (uiState.selectedElementId ? [uiState.selectedElementId] : []);
      if (ids.length > 0) {
        model.deleteElements(ids);
        uiState.setSelectedElements([]);
        uiState.setStatusMessage('Deleted');
      }
    }
    uiState.setContextMenu(null);
  }

  function handleHide(): void {
    const id = uiState.selectedElementId || uiState.selectedElementIds[0];
    if (id) {
      model.toggleHidden(id);
      uiState.setSelectedElements([]);
      uiState.setContextMenu(null);
      uiState.setStatusMessage(model.isHidden(id) ? 'Element hidden' : 'Element shown');
    } else {
      uiState.setContextMenu(null);
    }
  }

  function close(): void {
    uiState.setContextMenu(null);
  }

  let selectedId = $derived(uiState.selectedElementId || (uiState.selectedElementIds.length === 1 ? uiState.selectedElementIds[0] : null));
  let isHidden = $derived(selectedId ? model.isHidden(selectedId) : false);
</script>

{#if uiState.contextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50"
    onclick={close}
    oncontextmenu={(e) => e.preventDefault()}
  ></div>
  <div
    class="fixed z-50 rounded-lg bg-slate-800 border border-slate-700 shadow-xl py-1 min-w-[160px]"
    style="left: {uiState.contextMenu.x}px; top: {uiState.contextMenu.y}px;"
  >
    {#if selectedId}
      <button
        class="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 transition-colors"
        onclick={handleHide}
      >{isHidden ? 'Show Element' : 'Hide Element'}</button>
    {/if}
    <button
      class="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 transition-colors"
      onclick={handleDelete}
    >Delete Element</button>
    <div class="border-t border-slate-700 my-1"></div>
    <button
      class="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 transition-colors"
      onclick={close}
    >Cancel</button>
  </div>
{/if}
