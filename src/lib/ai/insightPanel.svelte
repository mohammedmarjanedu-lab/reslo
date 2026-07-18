<script lang="ts">
  import { loopEngine } from './loopEngine.svelte';
  import { memoryStore } from './memoryStore.svelte';
  import { onMount, onDestroy } from 'svelte';

  let show = $state(false);
  let insights = $derived(loopEngine.state.pendingInsights);
  let verified = $derived(loopEngine.state.verifiedInsights);

  function toggle(): void {
    show = !show;
    if (show) loopEngine.start();
  }

  function dismiss(insightId: string): void {
    loopEngine.dismissInsight(insightId);
  }

  function verify(insightId: string): void {
    loopEngine.verifyInsight(insightId);
  }

  function severityClass(s: string): string {
    switch (s) {
      case 'critical': return 'bg-red-900/30 border-red-600';
      case 'warning': return 'bg-yellow-900/30 border-yellow-600';
      default: return 'bg-blue-900/30 border-blue-600';
    }
  }

  function severityIcon(s: string): string {
    switch (s) {
      case 'critical': return '⬤';
      case 'warning': return '▲';
      default: return '●';
    }
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<div class="ai-insights-panel" class:open={show}>
  <button
    class="insights-toggle"
    onclick={toggle}
    aria-label={show ? 'Hide AI Insights' : 'Show AI Insights'}
    title={show ? 'Hide AI Insights (L)' : 'Show AI Insights (L)'}
  >
    <span class="pulse" class:active={loopEngine.state.running}>●</span>
    AI Loop
    <span class="badge">{insights.length}</span>
  </button>

  {#if show}
  <div class="insights-panel" onclick={(e) => e.stopPropagation()}>
    <div class="panel-header">
      <h3>Loop Insights</h3>
      <div class="header-controls">
        <span class="phase-badge">{loopEngine.state.phase}</span>
        <span class="status" class:running={loopEngine.state.running}>
          {loopEngine.state.running ? 'Running' : 'Paused'}
        </span>
        <button class="close-btn" onclick={toggle} aria-label="Close">×</button>
      </div>
    </div>

    {#if insights.length === 0 && verified.length === 0}
    <div class="empty-state">
      <p>No insights yet. Run the loop or make some edits.</p>
      <button class="run-btn" onclick={() => loopEngine.start()}>Start Loop</button>
    </div>
    {:else}
    <div class="insights-list">
      {#each insights as insight}
      <div class="insight-card" class:severity={severityClass(insight.severity)}>
        <div class="insight-header">
          <span class="severity-icon">{severityIcon(insight.severity)}</span>
          <span class="insight-title">{insight.title}</span>
          <span class="insight-time">{formatTime(insight.ts)}</span>
        </div>
        <p class="insight-desc">{insight.description}</p>
        <div class="insight-meta">
          <span class="kind-badge">{insight.kind}</span>
          <span class="confidence">{Math.round(insight.confidence * 100)}%</span>
          <span class="tokens">~{insight.tokensEstimate} tok</span>
        </div>
        {#if insight.suggestedAction}
        <p class="suggested-action">💡 {insight.suggestedAction}</p>
        {/if}
        <div class="insight-actions">
          <button class="verify-btn" onclick={() => verify(insight.id)}>Verify</button>
          <button class="dismiss-btn" onclick={() => dismiss(insight.id)}>Dismiss</button>
        </div>
      </div>
      {/each}
    </div>

    {#if verified.length > 0}
    <div class="verified-section">
      <h4>Verified ({verified.length})</h4>
      <div class="verified-list">
        {#each verified as v}
        <div class="verified-item">
          <span class="verified-title">{v.title}</span>
          <span class="verified-time">{formatTime(v.ts)}</span>
        </div>
        {/each}
      </div>
    </div>
    {/if}
    {/if}
  </div>
  {/if}
</div>

<style>
  .ai-insights-panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 1000;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
  }

  .insights-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }

  .insights-toggle:hover {
    border-color: #d62430;
    background: #1f1f1f;
  }

  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #666;
    transition: background 0.2s;
  }

  .pulse.active {
    background: #d62430;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .badge {
    background: #d62430;
    color: white;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 9px;
    font-weight: bold;
  }

  .insights-panel {
    position: absolute;
    right: 0;
    bottom: 44px;
    width: 380px;
    max-height: 500px;
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: #1a1a1a;
    border-bottom: 1px solid #333;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .phase-badge {
    background: #2a2a2a;
    color: #aaa;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status {
    font-size: 9px;
    color: #666;
  }

  .status.running {
    color: #d62430;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .close-btn:hover { color: #fff; }

  .empty-state {
    padding: 24px;
    text-align: center;
    color: #888;
  }

  .empty-state p { margin: 0 0 12px; }

  .run-btn {
    background: #d62430;
    border: none;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
  }

  .run-btn:hover { background: #b01e28; }

  .insights-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .insight-card {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
    transition: border-color 0.2s;
  }

  .insight-card:hover {
    border-color: #444;
  }

  .insight-card.severity.bg-red-900\/30 {
    border-left: 3px solid #ef4444;
  }

  .insight-card.severity.bg-yellow-900\/30 {
    border-left: 3px solid #f59e0b;
  }

  .insight-card.severity.bg-blue-900\/30 {
    border-left: 3px solid #3b82f6;
  }

  .insight-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .severity-icon {
    color: #d62430;
    font-size: 10px;
  }

  .insight-title {
    flex: 1;
    font-weight: 600;
    color: #fff;
    font-size: 11px;
  }

  .insight-time {
    color: #666;
    font-size: 9px;
  }

  .insight-desc {
    margin: 0 0 8px;
    color: #ccc;
    font-size: 10px;
    line-height: 1.4;
  }

  .insight-meta {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 9px;
  }

  .kind-badge {
    background: #2a2a2a;
    color: #888;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: capitalize;
  }

  .confidence { color: #10b981; }
  .tokens { color: #6366f1; }

  .suggested-action {
    margin: 8px 0 0;
    padding: 6px 8px;
    background: #1a2a1a;
    border-radius: 4px;
    color: #86efac;
    font-size: 9px;
  }

  .insight-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .verify-btn, .dismiss-btn {
    background: transparent;
    border: 1px solid #333;
    color: #aaa;
    padding: 4px 10px;
    border-radius: 3px;
    font-size: 9px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .verify-btn:hover {
    border-color: #10b981;
    color: #10b981;
  }

  .dismiss-btn:hover {
    border-color: #ef4444;
    color: #ef4444;
  }

  .verified-section {
    border-top: 1px solid #222;
    padding: 10px 12px;
    background: #151515;
  }

  .verified-section h4 {
    margin: 0 0 8px;
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
  }

  .verified-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 120px;
    overflow-y: auto;
  }

  .verified-item {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    background: #1a1a1a;
    border-radius: 3px;
    font-size: 9px;
  }

  .verified-title { color: #ccc; }
  .verified-time { color: #666; }
</style>