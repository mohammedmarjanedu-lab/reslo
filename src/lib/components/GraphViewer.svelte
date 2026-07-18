<script lang="ts">
  import { graphStore } from '../stores/graphStore.svelte';

  function copyJson() {
    graphStore.copyToClipboard();
  }

  function close() {
    graphStore.showGraphViewer = false;
  }

  $effect(() => {
    if (graphStore.showGraphViewer) graphStore.refresh();
  });
</script>

{#if graphStore.showGraphViewer && graphStore.report}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onclick={close}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="max-h-[80vh] max-w-[90vw] overflow-auto rounded-lg bg-slate-800 border border-slate-600 shadow-2xl p-4"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-bold text-slate-200">Graph State</div>
        <div class="flex gap-2">
          <button onclick={copyJson} class="rounded bg-indigo-700 px-3 py-1 text-xs text-white hover:bg-indigo-600">Copy JSON</button>
          <button onclick={close} class="rounded bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600">Close</button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div class="rounded bg-slate-700 p-2">
          <span class="text-slate-400">Tokens</span>
          <span class="ml-2 font-mono text-white">{graphStore.report.tokens}</span>
        </div>
        <div class="rounded bg-slate-700 p-2">
          <span class="text-slate-400">Level</span>
          <span class="ml-2 font-mono {graphStore.report.level === 'green' ? 'text-green-400' : graphStore.report.level === 'yellow' ? 'text-yellow-400' : 'text-red-400'}">{graphStore.report.level}</span>
        </div>
        <div class="rounded bg-slate-700 p-2">
          <span class="text-slate-400">Compression</span>
          <span class="ml-2 font-mono text-white">L{graphStore.report.compression}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="rounded bg-slate-700 p-2">
          <div class="text-slate-400 mb-1">Nodes ({graphStore.report.graph.n.length})</div>
          <div class="max-h-40 overflow-y-auto space-y-0.5">
            {#each graphStore.report.graph.n as node}
              <div class="font-mono text-slate-300">
                #{node.i} {node.t} ({node.x}, {node.y}){node.p ? ` [${node.p}]` : ''}
              </div>
            {/each}
          </div>
        </div>
        <div class="rounded bg-slate-700 p-2">
          <div class="text-slate-400 mb-1">Edges ({graphStore.report.graph.e.length})</div>
          <div class="max-h-40 overflow-y-auto space-y-0.5">
            {#each graphStore.report.graph.e as edge}
              <div class="font-mono text-slate-300">
                #{edge.i}: {edge.s}→{edge.t} [{edge.k}]{edge.p ? ` ${edge.p}` : ''}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="mt-3 rounded bg-slate-700 p-2 text-xs">
        <div class="text-slate-400 mb-1">Metrics</div>
        <pre class="font-mono text-slate-300 whitespace-pre-wrap">{JSON.stringify(graphStore.report.graph.m, null, 2)}</pre>
      </div>
    </div>
  </div>
{/if}
