<script lang="ts">
  import { model } from '../stores/structuralModel.svelte';
  import { computeGlobalMetrics } from '../engine/mathEngine';
  import { femState } from '../stores/femResults.svelte';

  let metrics = $derived(computeGlobalMetrics(model.slabs, model.columns, model.walls, model.polylineWalls, model.beams, model.dropPanels, undefined, 0.25, model.nonStructuralWalls, model.polylineNonStructuralWalls));

  let maxRatio = $derived(Math.max(metrics.torsionalRatioX, metrics.torsionalRatioY));
  let controllingAxis = $derived(
    metrics.torsionalRatioX >= metrics.torsionalRatioY ? 'X' : 'Y'
  );

  function severityColor(torsionalRatio: number): string {
    if (torsionalRatio > 0.30) return 'text-red-400';
    if (torsionalRatio > 0.10) return 'text-orange-400';
    if (torsionalRatio > 0.05) return 'text-yellow-400';
    return 'text-green-400';
  }

  function severityBg(torsionalRatio: number): string {
    if (torsionalRatio > 0.30) return 'bg-red-500/20 border-red-500/40';
    if (torsionalRatio > 0.10) return 'bg-orange-500/15 border-orange-500/30';
    if (torsionalRatio > 0.05) return 'bg-yellow-500/10 border-yellow-500/25';
    return 'bg-emerald-500/10 border-emerald-500/25';
  }

  function severityLabel(): string {
    if (metrics.hasExtremeTorsionalIrregularity) return 'EXTREME';
    if (metrics.hasTorsionalIrregularity) return 'IRREGULAR';
    if (metrics.torsionalRatioX > 0.05 || metrics.torsionalRatioY > 0.05) return 'MODERATE';
    return 'GOOD';
  }

  function severityDescription(): string {
    const rx = metrics.torsionalRatioX;
    const ry = metrics.torsionalRatioY;
    const axis = controllingAxis;

    if (metrics.hasExtremeTorsionalIrregularity) {
      const pct = axis === 'X' ? (rx * 100).toFixed(1) : (ry * 100).toFixed(1);
      return `Eccentricity in ${axis} is ${pct}% of plan dimension (exceeds 30% limit). Extreme torsional irregularity per IS 1893 / ASCE 7. Design eccentricity (ea+5%) in X: ${(metrics.torsionalRatioWithAccidentalX*100).toFixed(1)}%, Y: ${(metrics.torsionalRatioWithAccidentalY*100).toFixed(1)}%. Redesign lateral system.`;
    }
    if (metrics.hasTorsionalIrregularity) {
      const pct = axis === 'X' ? (rx * 100).toFixed(1) : (ry * 100).toFixed(1);
      return `Eccentricity in ${axis} is ${pct}% of plan dimension (exceeds 10% limit). Torsional irregularity per IS 1893 Table 7. Design eccentricity (ea+5%): X ${(metrics.torsionalRatioWithAccidentalX*100).toFixed(1)}%, Y ${(metrics.torsionalRatioWithAccidentalY*100).toFixed(1)}%. Consider 3D dynamic analysis.`;
    }
    if (rx > 0.05 || ry > 0.05) {
      const pct = axis === 'X' ? (rx * 100).toFixed(1) : (ry * 100).toFixed(1);
      return `Eccentricity in ${axis} is ${pct}% of plan dimension (exceeds 5% threshold). Design eccentricity (ea+5%): X ${(metrics.torsionalRatioWithAccidentalX*100).toFixed(1)}%, Y ${(metrics.torsionalRatioWithAccidentalY*100).toFixed(1)}%. Review lateral element layout.`;
    }
    return `Eccentricity within 5% in both axes — well-balanced. Design eccentricity (ea+5%): X ${(metrics.torsionalRatioWithAccidentalX*100).toFixed(1)}%, Y ${(metrics.torsionalRatioWithAccidentalY*100).toFixed(1)}%. CM (${metrics.cm.x.toFixed(2)}, ${metrics.cm.y.toFixed(2)}) near CR (${metrics.cr.x.toFixed(2)}, ${metrics.cr.y.toFixed(2)}).`;
  }
</script>

<div class="rounded-lg bg-slate-800/95 p-3 border border-slate-700 text-xs font-mono space-y-2 shadow-lg w-[220px]">
  <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Floor Eccentricity</div>

  <!-- CM / CR -->
  <div class="grid grid-cols-2 gap-x-3 gap-y-1">
    <div class="text-slate-500">CM</div>
    <div class="text-blue-300 text-right">({metrics.cm.x.toFixed(3)}, {metrics.cm.y.toFixed(3)}) m</div>
    <div class="text-slate-500">CR</div>
    <div class="text-red-300 text-right">({metrics.cr.x.toFixed(3)}, {metrics.cr.y.toFixed(3)}) m</div>
  </div>

  <!-- CM / CR Legend -->
  <div class="flex flex-col gap-1 text-[9px] text-slate-400 py-1 px-1.5 bg-slate-900/40 rounded border border-slate-700/30">
    <div class="flex items-center gap-1.5">
      <span class="inline-block w-2 h-2 rounded-full bg-[#22C55E] shrink-0"></span>
      <span>CM: Center of Mass</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="inline-block w-2 h-2 bg-[#F97316] rotate-45 shrink-0"></span>
      <span>CR: Center of Rigidity</span>
    </div>
  </div>

  <!-- Eccentricities -->
  <div class="grid grid-cols-2 gap-x-3 gap-y-1">
    <div class="text-slate-500">ex</div>
    <div class="text-right">
      <span class="{severityColor(metrics.torsionalRatioX)} font-bold">{metrics.ex.toFixed(3)} m</span>
      <span class="text-slate-500 ml-1">({(metrics.torsionalRatioX * 100).toFixed(1)}%)</span>
    </div>
    <div class="text-slate-500">ey</div>
    <div class="text-right">
      <span class="{severityColor(metrics.torsionalRatioY)} font-bold">{metrics.ey.toFixed(3)} m</span>
      <span class="text-slate-500 ml-1">({(metrics.torsionalRatioY * 100).toFixed(1)}%)</span>
    </div>
  </div>

</div>
