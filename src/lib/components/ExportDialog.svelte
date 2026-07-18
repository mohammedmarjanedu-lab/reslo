<script lang="ts">
  import { jsPDF } from 'jspdf';
  import { uiState } from '../stores/uiState.svelte';
  import { model } from '../stores/structuralModel.svelte';
  import { exportDrawingSheet } from '../canvas/drawSheet';
  import { exportDXF } from '../export/exportDXF';
  import { exportE2K } from '../export/exportE2K';

  let exportFormat = $state<'png' | 'pdf' | 'dxf' | 'e2k'>('png');
  let includeTitleBlock = $state(true);
  let includeScale = $state(true);
  let includeNorthArrow = $state(true);
  let includeDimensions = $state(true);
  let fileName = $state('reslo-structural-plan');

  let isExporting = $state(false);

  const costBreakdowns = [
    { label: 'RCC', total: 'Rs 15.14L', perStorey: 'Rs 1.51L/STOREY', mat: '1 col material: Conc 24.2...' },
    { label: 'STEEL', total: 'Rs 77.53L', perStorey: 'Rs 7.75L/STOREY', mat: '1 col material: Conc 0.0...' },
    { label: 'CFT', total: 'Rs 53.58L', perStorey: 'Rs 5.36L/STOREY', mat: '1 col material: Conc 10.2...' },
  ];

  const elementCounts = $derived({
    columns: model.columns.length,
    walls: model.walls.length,
    polylineWalls: model.polylineWalls.length,
    beams: model.beams.length,
    slabs: model.slabs.length,
    dropPanels: model.dropPanels.length,
    dimensions: model.dimensions.length,
  });

  const totalElements = $derived(
    elementCounts.columns + elementCounts.walls + elementCounts.polylineWalls +
    elementCounts.beams + elementCounts.slabs + elementCounts.dropPanels + elementCounts.dimensions
  );

  const ACCENT = {
    slab: '#ff4d79',
    column: '#00e5ff',
    beam: '#10b981',
    wall: '#a78bfa',
    dropPanel: '#f97316',
    primary: '#6366f1',
    grade: '#f472b6',
  };

  function close() {
    uiState.showExportDialog = false;
  }

  function formatDateShort(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }

  function handleExport() {
    isExporting = true;
    try {
      if (exportFormat === 'png' || exportFormat === 'pdf') {
        const sheetCanvas = exportDrawingSheet(
          model.slabs, model.columns, model.walls, model.polylineWalls, model.nonStructuralWalls, model.polylineNonStructuralWalls, model.beams, model.dropPanels,
          model.planImage, model.imageNaturalWidth, model.imageNaturalHeight,
          model.isCalibrated, model.calibrator.pixelsPerMeter
        );
        if (exportFormat === 'png') {
          const link = document.createElement('a');
          link.download = `${fileName}.png`;
          link.href = sheetCanvas.toDataURL('image/png');
          link.click();
          uiState.setStatusMessage('Drawing sheet exported as PNG');
        } else {
          const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [sheetCanvas.width, sheetCanvas.height]
          });
          pdf.addImage(sheetCanvas.toDataURL('image/png'), 'PNG', 0, 0, sheetCanvas.width, sheetCanvas.height);
          pdf.save(`${fileName}.pdf`);
          uiState.setStatusMessage('Drawing sheet exported as PDF');
        }
      } else if (exportFormat === 'dxf') {
        const content = exportDXF(
          model.slabs, model.columns, model.walls, model.polylineWalls, model.beams, model.dropPanels, model.nonStructuralWalls, model.polylineNonStructuralWalls,
          model.dimensions,
          model.calibrator.pixelsPerMeter, model.isCalibrated, model.calibratedLabel
        );
        const blob = new Blob([content], { type: 'application/dxf' });
        const link = document.createElement('a');
        link.download = `${fileName}.dxf`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        uiState.setStatusMessage('DXF exported');
      } else if (exportFormat === 'e2k') {
        const content = exportE2K(
          model.slabs, model.columns, model.walls, model.polylineWalls, model.beams, model.dropPanels,
          model.concreteGrade, model.isCalibrated, model.calibrator.pixelsPerMeter
        );
        const blob = new Blob([content], { type: 'text/plain' });
        const link = document.createElement('a');
        link.download = `${fileName}.E2K`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        uiState.setStatusMessage('ETABS E2K exported');
      }
    } finally {
      isExporting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="export-overlay" onclick={close}>
  <div class="bg-orb bg-orb-1" aria-hidden="true"></div>
  <div class="bg-orb bg-orb-2" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="export-panel" onclick={(e) => e.stopPropagation()}>
    <div class="export-header">
      <div class="export-header-brand">
        <span class="export-logo">R</span>
        <span class="export-product">Export</span>
        <div class="topbar-vdivider"></div>
        <span class="topbar-module">Drawing Sheet</span>
      </div>
      <div class="export-header-center">
        <div class="export-indicator">
          <span class="indicator-dot"></span>
          <span class="indicator-label">{totalElements} elements</span>
          <span class="indicator-sep">·</span>
          <span class="indicator-value">{model.isCalibrated ? 'Calibrated' : 'Not calibrated'}</span>
        </div>
      </div>
      <button class="export-close-btn" onclick={close} type="button" aria-label="Close">&times;</button>
    </div>

    <div class="export-body">
      <div class="export-sidebar">
        <div class="export-section">
          <div class="section-label">
            <span class="section-icon">&#9783;</span>
            Format
          </div>
          <div class="format-grid">
            {#each [
              { value: 'png', label: 'PNG', desc: 'Raster drawing sheet' },
              { value: 'pdf', label: 'PDF', desc: 'Vector drawing sheet' },
              { value: 'dxf', label: 'DXF', desc: 'CAD exchange format' },
              { value: 'e2k', label: 'E2K', desc: 'ETABS import format' }
            ] as fmt}
              <button
                class="format-btn {exportFormat === fmt.value ? 'active' : ''}"
                onclick={() => exportFormat = fmt.value as 'png' | 'pdf' | 'dxf' | 'e2k'}
                type="button"
              >
                <span class="format-btn-label">{fmt.label}</span>
                <span class="format-btn-desc">{fmt.desc}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="export-section">
          <div class="section-label">
            <span class="section-icon">&#9881;</span>
            Options
          </div>
          {#if exportFormat === 'png' || exportFormat === 'pdf'}
            <label class="option-row">
              <input type="checkbox" bind:checked={includeTitleBlock} class="option-checkbox" />
              <span class="option-text">Title block</span>
            </label>
            <label class="option-row">
              <input type="checkbox" bind:checked={includeScale} class="option-checkbox" />
              <span class="option-text">Scale bar</span>
            </label>
            <label class="option-row">
              <input type="checkbox" bind:checked={includeNorthArrow} class="option-checkbox" />
              <span class="option-text">North arrow</span>
            </label>
          {/if}
          <label class="option-row">
            <input type="checkbox" bind:checked={includeDimensions} class="option-checkbox" />
            <span class="option-text">Dimensions</span>
          </label>
        </div>

        <div class="export-section">
          <div class="section-label">
            <span class="section-icon">&#9998;</span>
            File name
          </div>
          <div class="file-name-row">
            <input
              type="text"
              bind:value={fileName}
              class="file-name-input"
              placeholder="reslo-structural-plan"
            />
            <span class="file-ext">.{exportFormat === 'e2k' ? 'E2K' : exportFormat}</span>
          </div>
        </div>
      </div>

      <div class="export-preview">
        {#if exportFormat === 'png' || exportFormat === 'pdf'}
          <!-- landscape plan drawing sheet preview -->
          <div class="sheet-preview">
            <div class="sheet-inner">
              
              <!-- Sheet Header -->
              <div class="sheet-header-bar">
                <div>
                  <span style="font-weight: 800; margin-right: 4px;">RESLO</span>
                  <span style="color: #6366f1; font-weight: 600;">CONCEPT STRUCTURAL LAYOUT</span>
                </div>
                <div style="color: #6b7280; font-size: 6px;">
                  {totalElements} elements · {model.isCalibrated ? 'Calibrated' : 'Not calibrated'}
                </div>
              </div>

              <!-- Sheet Legend -->
              <div class="sheet-legend-bar">
                <div class="legend-item">
                  <span class="legend-color-box" style="background: {ACCENT.column}"></span>
                  <span>Columns ({elementCounts.columns})</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color-box" style="background: {ACCENT.beam}"></span>
                  <span>Beams ({elementCounts.beams})</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color-box" style="background: {ACCENT.wall}"></span>
                  <span>Walls ({elementCounts.walls + elementCounts.polylineWalls})</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color-box" style="background: {ACCENT.slab}"></span>
                  <span>Slabs ({elementCounts.slabs})</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color-box" style="background: {ACCENT.dropPanel}"></span>
                  <span>Drop Panels ({elementCounts.dropPanels})</span>
                </div>
              </div>

              <!-- Floor Plan Drawing in Center -->
              <div class="sheet-drawing-area">
                <svg viewBox="0 0 200 120" width="100%" height="100%">
                  <!-- Grid -->
                  <defs>
                    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#F1F5F9" stroke-width="0.3"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />

                  <!-- Miniature floor plan outlines -->
                  <rect x="50" y="20" width="100" height="70" fill="none" stroke="#E2E8F0" stroke-width="0.8" />
                  <rect x="54" y="24" width="92" height="62" fill="rgba(99, 102, 241, 0.02)" stroke="#94A3B8" stroke-dasharray="2,2" stroke-width="0.5" />
                  
                  <!-- Walls -->
                  <line x1="50" y1="55" x2="150" y2="55" stroke="#a78bfa" stroke-width="1.2" />
                  <line x1="90" y1="20" x2="90" y2="90" stroke="#a78bfa" stroke-width="1.2" />

                  <!-- Slabs -->
                  <rect x="54" y="24" width="36" height="31" fill="rgba(255, 77, 121, 0.05)" />
                  <rect x="90" y="24" width="56" height="31" fill="rgba(255, 77, 121, 0.05)" />

                  <!-- Columns -->
                  <rect x="48" y="18" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="88" y="18" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="148" y="18" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="48" y="53" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="88" y="53" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="148" y="53" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="48" y="88" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="88" y="88" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />
                  <rect x="148" y="88" width="4" height="4" fill="#00e5ff" stroke="#1e293b" stroke-width="0.4" />

                  <!-- Text -->
                  <text x="100" y="110" font-size="4" fill="#64748B" font-family="Courier New" font-weight="bold" text-anchor="middle">PROPOSED GROUND FLOOR PLAN</text>
                </svg>
              </div>

              <!-- Scale and North arrow at bottom-left -->
              <div class="sheet-scale-arrow">
                <div class="scale-box">
                  <span>SCALE</span>
                  <span class="scale-value">{model.isCalibrated ? model.calibratedLabel.replace('✓ Calibrated ', '').replace('○ ', '') : '1:100'}</span>
                </div>
                <div class="north-arrow-draw">
                  <span style="font-weight: bold; margin-bottom: -1px;">N</span>
                  <svg viewBox="0 0 10 10" width="8" height="8">
                    <polygon points="5,0 2,8 5,6 8,8" fill="#374151" />
                  </svg>
                </div>
              </div>

              <!-- Perfectly formatted Title Block on the bottom-right -->
              <div class="preview-tb-right">
                <div class="preview-tb-top">
                  <span style="color: #2a2418; font-weight: bold; margin-right: 4px;">CONCEPT DESIGNS</span>
                  <span class="preview-tb-divider"></span>
                  <span style="margin: 0 3px;">DATE: {formatDateShort()}</span>
                  <span class="preview-tb-divider"></span>
                  <span style="margin: 0 3px;">SCALE: {model.isCalibrated ? model.calibratedLabel.replace('✓ Calibrated ', '').replace('○ ', '') : '1:100'}</span>
                  <span class="preview-tb-divider"></span>
                  <span style="margin: 0 3px;">COLUMN COST: 1 COL</span>
                  <span style="flex: 1;"></span>
                  <span style="text-decoration: underline; color: #2563eb;">PRINT</span>
                </div>

                <div class="preview-tb-body">
                  <!-- Logo -->
                  <div class="preview-tb-logo">
                    <div class="preview-logo-red">R</div>
                  </div>

                  <!-- Info -->
                  <div class="preview-tb-info">
                    <div class="preview-tb-row">
                      <span class="preview-lbl">PROJECT</span>
                      <span class="preview-val">RESLO — Structural Layout</span>
                    </div>
                    <div class="preview-tb-row">
                      <span class="preview-lbl">DRAWING TITLE</span>
                      <span class="preview-val">Structural Framing Plan</span>
                    </div>
                  </div>

                  <!-- Params -->
                  <div class="preview-tb-params">
                    <div class="preview-tb-row">
                      <span class="preview-lbl">GRID SIZE</span>
                      <span class="preview-val">9m x 9m</span>
                    </div>
                    <div class="preview-tb-row">
                      <span class="preview-lbl">STORIES</span>
                      <span class="preview-val">10</span>
                    </div>
                    <div class="preview-tb-row">
                      <span class="preview-lbl">STORY HT.</span>
                      <span class="preview-val">4m</span>
                    </div>
                  </div>

                  <!-- Costs -->
                  <div class="preview-tb-costs">
                    {#each costBreakdowns as cost}
                      <div class="preview-cost-col">
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                          <span class="preview-lbl">{cost.label}</span>
                          <span class="preview-val-red">{cost.total}</span>
                        </div>
                        <span class="preview-val-red" style="font-size: 5px;">{cost.perStorey}</span>
                        <span class="preview-lbl" style="font-size: 3.5px; overflow: hidden; white-space: nowrap;">{cost.mat}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>

            </div>
          </div>
        {:else}
          <div class="preview-header">
            <div class="preview-accents">
              <div class="accent-bar" style="background: {ACCENT.column}"></div>
              <div class="accent-bar" style="background: {ACCENT.slab}"></div>
              <div class="accent-bar" style="background: {ACCENT.beam}"></div>
            </div>
            <span class="preview-title">Project Summary</span>
          </div>
          <div class="preview-grid">
            <div class="preview-node" style="border-left-color: {ACCENT.column}">
              <span class="node-label">Columns</span>
              <strong class="node-value">{elementCounts.columns}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.wall}">
              <span class="node-label">Walls</span>
              <strong class="node-value">{elementCounts.walls + elementCounts.polylineWalls}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.beam}">
              <span class="node-label">Beams</span>
              <strong class="node-value">{elementCounts.beams}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.slab}">
              <span class="node-label">Slabs</span>
              <strong class="node-value">{elementCounts.slabs}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.dropPanel}">
              <span class="node-label">Drop Panels</span>
              <strong class="node-value">{elementCounts.dropPanels}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.primary}">
              <span class="node-label">Dimensions</span>
              <strong class="node-value">{elementCounts.dimensions}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.grade}">
              <span class="node-label">Concrete</span>
              <strong class="node-value">{model.concreteGrade}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.grade}">
              <span class="node-label">Rebar</span>
              <strong class="node-value">{model.rebarGrade}</strong>
            </div>
            <div class="preview-node" style="border-left-color: {ACCENT.primary}">
              <span class="node-label">Scale</span>
              <strong class="node-value">{model.isCalibrated ? model.calibratedLabel : '—'}</strong>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="export-footer">
      <span class="footer-hint">Press Esc to cancel</span>
      <div class="footer-actions">
        <button class="footer-btn secondary" onclick={close} type="button">Cancel</button>
        <button class="footer-btn primary" onclick={handleExport} disabled={isExporting} type="button">
          {isExporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .export-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    animation: fadeIn 0.15s ease-out;
    overflow: hidden;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .bg-orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
  }
  .bg-orb-1 {
    top: -15%;
    left: -8%;
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.07) 0%, transparent 62%);
    animation: driftOrb1 22s ease-in-out infinite;
  }
  .bg-orb-2 {
    bottom: -12%;
    right: -6%;
    width: 460px;
    height: 460px;
    background: radial-gradient(circle, rgba(0, 229, 255, 0.04) 0%, transparent 62%);
    animation: driftOrb2 28s ease-in-out infinite;
  }
  @keyframes driftOrb1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, -12px); } }
  @keyframes driftOrb2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-16px, 10px); } }

  .export-panel {
    width: 860px;
    max-height: 90vh;
    background: rgba(9, 11, 17, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(24px);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease-out;
    position: relative;
    z-index: 1;
  }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .export-header {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    gap: 12px;
  }
  .export-header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .export-logo {
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, rgba(214, 36, 48, 0.28), rgba(214, 36, 48, 0.08));
    border: 1px solid rgba(214, 36, 48, 0.35);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #D62430;
    font-size: 0.75rem;
    font-weight: 700;
    font-family: 'Space Grotesk', sans-serif;
    box-shadow: 0 0 12px rgba(214, 36, 48, 0.15);
  }
  .export-product {
    font-size: 0.9rem;
    font-weight: 700;
    color: #e2e8f0;
    font-family: 'Space Grotesk', sans-serif;
    letter-spacing: -0.01em;
  }

  .topbar-vdivider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 4px;
  }
  .topbar-module {
    font-size: 0.82rem;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 0.01em;
    font-family: 'Space Grotesk', sans-serif;
  }

  .export-header-center {
    flex: 1;
    display: flex;
    justify-content: center;
  }
  .export-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 0.7rem;
  }
  .indicator-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
    flex-shrink: 0;
  }
  .indicator-label { color: #94a3b8; font-weight: 500; }
  .indicator-sep { color: rgba(255,255,255,0.15); }
  .indicator-value { color: #e2e8f0; font-size: 0.7rem; background: rgba(255,255,255,0.06); padding: 1px 7px; border-radius: 4px; font-weight: 600; }
  .export-close-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
  }
  .export-close-btn:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }

  .export-body {
    display: flex;
    gap: 0;
    flex: 1;
    min-height: 0;
  }
  .export-sidebar {
    width: 250px;
    flex-shrink: 0;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    overflow-y: auto;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    position: relative;
  }
  .export-sidebar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 28px;
    bottom: 28px;
    width: 2px;
    border-radius: 0 2px 2px 0;
    background: #6366f1;
    opacity: 0.35;
  }
  .export-sidebar::-webkit-scrollbar { width: 6px; }
  .export-sidebar::-webkit-scrollbar-track { background: transparent; }
  .export-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
  .export-sidebar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

  .export-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    font-family: 'Space Grotesk', sans-serif;
  }
  .section-icon { font-size: 0.7rem; }

  .format-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  .format-btn {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 2px solid rgba(255, 255, 255, 0.08);
    transition: all 0.15s;
    text-align: left;
  }
  .format-btn:hover { background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.1); }
  .format-btn.active { border-left-color: #818cf8; background: rgba(99, 102, 241, 0.08); border-color: rgba(99, 102, 241, 0.2); }
  .format-btn-label { font-size: 0.8rem; font-weight: 600; color: #e2e8f0; font-family: 'Space Grotesk', sans-serif; }
  .format-btn-desc { font-size: 0.62rem; color: #64748b; }

  .option-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .option-row:hover { background: rgba(255, 255, 255, 0.03); }
  .option-checkbox {
    accent-color: #818cf8;
    width: 14px;
    height: 14px;
    cursor: pointer;
  }
  .option-text { font-size: 0.82rem; color: #cbd5e1; font-weight: 500; }

  .file-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .file-name-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    font-size: 0.8rem;
    outline: none;
    transition: all 0.15s;
    font-family: 'JetBrains Mono', monospace;
  }
  .file-name-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); }
  .file-name-input::placeholder { color: #475569; }
  .file-ext { font-size: 0.75rem; color: #64748b; font-family: 'JetBrains Mono', monospace; font-weight: 500; }

  .export-preview {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
    position: relative;
    background: #090b11;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .export-preview::-webkit-scrollbar { width: 6px; }
  .export-preview::-webkit-scrollbar-track { background: transparent; }
  .export-preview::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

  .preview-header {
    margin-bottom: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  .preview-accents {
    display: flex;
    gap: 4px;
  }
  .accent-bar {
    height: 3px;
    flex: 1;
    border-radius: 2px;
  }
  .preview-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    font-family: 'Space Grotesk', sans-serif;
  }

  .preview-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    width: 100%;
  }
  .preview-node {
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-left: 2px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: all 0.15s;
  }
  .preview-node:hover { background: rgba(255, 255, 255, 0.04); }
  .preview-node .node-label { font-size: 0.62rem; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.07em; font-family: 'Space Grotesk', sans-serif; }
  .preview-node .node-value { font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; color: #e2e8f0; font-weight: 500; letter-spacing: -0.02em; }

  /* Restructured Landscape Blueprint Sheet Preview Styles */
  .sheet-preview {
    background: #FAFAFA;
    border: 1px solid rgba(0, 0, 0, 0.15);
    padding: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 580px;
    aspect-ratio: 11.69 / 8.27; /* Landscape A4 ratio */
    box-sizing: border-box;
    position: relative;
  }

  .sheet-inner {
    border: 1.5px solid #111111;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 6px;
    box-sizing: border-box;
    position: relative;
  }

  .sheet-header-bar {
    background: #f8f9fc;
    border: 0.5px solid #d0d5dd;
    padding: 4px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 7px;
    font-weight: bold;
    color: #111827;
    margin-bottom: 4px;
    flex-shrink: 0;
  }

  .sheet-legend-bar {
    display: flex;
    gap: 8px;
    font-size: 6px;
    font-family: 'Space Grotesk', sans-serif;
    color: #374151;
    margin-bottom: 4px;
    flex-shrink: 0;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .legend-color-box {
    width: 6px;
    height: 6px;
    border-radius: 1px;
  }

  .sheet-drawing-area {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    background: #FFFFFF;
    border: 0.5px solid #d1d5db;
    margin-bottom: 50px; /* leave space for scale and title block */
    overflow: hidden;
  }

  .sheet-scale-arrow {
    position: absolute;
    bottom: 6px;
    left: 8px;
    display: flex;
    align-items: flex-end;
    gap: 12px;
    pointer-events: none;
  }

  .scale-box {
    display: flex;
    flex-direction: column;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 6px;
    color: #6b7280;
  }

  .scale-value {
    font-family: 'JetBrains Mono', monospace;
    font-weight: bold;
    color: #111827;
    font-size: 7px;
  }

  .north-arrow-draw {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 5px;
    color: #374151;
  }

  /* Fixed Title Block on the bottom-right */
  .preview-tb-right {
    position: absolute;
    bottom: 6px;
    right: 8px;
    width: 60%;
    height: 48px;
    background: #f5eed8;
    border: 1px solid #8b7d5e;
    font-family: 'Courier New', monospace;
    font-size: 5px;
    color: #3d3520;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .preview-tb-top {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #8b7d5e;
    padding: 1px 4px;
    font-weight: bold;
    font-size: 4.5px;
    background: rgba(0, 0, 0, 0.02);
  }

  .preview-tb-divider {
    width: 1px;
    height: 6px;
    background: #8b7d5e;
    margin: 0 1px;
  }

  .preview-tb-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .preview-tb-logo {
    width: 25px;
    border-right: 1px solid #8b7d5e;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-logo-red {
    font-family: Arial, sans-serif;
    font-weight: 800;
    font-size: 11px;
    color: #c0392b;
  }

  .preview-tb-info {
    flex: 1.5;
    border-right: 1px solid #8b7d5e;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    padding: 2px 4px;
  }

  .preview-tb-row {
    border-bottom: 1px solid #d4c9a8;
    display: flex;
    flex-direction: column;
    padding: 1px 0;
  }

  .preview-tb-row:last-child {
    border-bottom: none;
  }

  .preview-tb-params {
    width: 45px;
    border-right: 1px solid #8b7d5e;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    padding: 2px 4px;
  }

  .preview-tb-costs {
    flex: 2.8;
    display: flex;
    padding: 2px;
  }

  .preview-cost-col {
    flex: 1;
    border-right: 1px solid #d4c9a8;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0 4px;
  }

  .preview-cost-col:last-child {
    border-right: none;
  }

  .preview-lbl {
    font-size: 4px;
    color: #6b5e3a;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-val {
    font-size: 5.5px;
    color: #3d3520;
    font-weight: bold;
  }

  .preview-val-red {
    font-size: 6px;
    color: #c0392b;
    font-weight: bold;
  }

  .export-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .footer-hint { font-size: 0.7rem; color: #475569; }
  .footer-actions { display: flex; gap: 8px; }
  .footer-btn {
    padding: 8px 18px;
    border-radius: 10px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
    font-family: 'Space Grotesk', sans-serif;
  }
  .footer-btn.secondary {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }
  .footer-btn.secondary:hover { background: rgba(255, 255, 255, 0.08); color: #e2e8f0; }
  .footer-btn.primary {
    background: #6366f1;
    color: white;
    box-shadow: 0 0 16px rgba(99, 102, 241, 0.3);
  }
  .footer-btn.primary:hover { background: #4f46e5; }
  .footer-btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
