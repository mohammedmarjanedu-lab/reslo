import type { SlabFEMResult, FEMMesh, FEMResultType } from '../engine/types';

class FEMResultState {
  slabResults = $state<Map<string, SlabFEMResult>>(new Map());
  isComputing = $state(false);
  progress = $state(0);
  error = $state<string | null>(null);
  warnings = $state<string[]>([]);
  disconnectedIds = $state<Set<string>>(new Set());
  resultType = $state<FEMResultType>('deflection');
  deformedScale = $state(30);
  showFEMContour = $state(false);
  showFEMMesh = $state(false);
  activeSlabId = $state<string | null>(null);

  private _timeoutId: ReturnType<typeof setTimeout> | null = null;

  get hasResults(): boolean {
    return this.slabResults.size > 0;
  }

  get globalMinWz(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minWz < min) min = r.minWz; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxWz(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxWz > max) max = r.maxWz; }
    return max === -Infinity ? 0 : max;
  }

  get activeResult(): SlabFEMResult | undefined {
    return this.activeSlabId ? this.slabResults.get(this.activeSlabId) : undefined;
  }

  // ─── P3: Derived contour cache ───
  // Recomputed only when slabResults OR resultType change — NOT every render frame.
  // Returns per-slab node-value maps + unified global min/max for the current result type.
  contourCache = $derived.by(() => {
    const rt = this.resultType;
    const useVisible = (s: SlabFEMResult) => s; // all slabs (visibility handled in renderer)
    const slabs: SlabFEMResult[] = [];
    for (const r of this.slabResults.values()) slabs.push(r);

    type ContourData = { nodeValues: Map<number, number>; globalMin: number; globalMax: number };
    const perSlab = new Map<string, ContourData>();
    let globalMin = 0;
    let globalMax = 0;

    function safeMinMax(arr: number[]): [number, number] {
      if (arr.length === 0) return [0, 0];
      let mn = arr[0], mx = arr[0];
      for (let i = 1; i < arr.length; i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i]; }
      return [mn, mx];
    }
    function elemToNodeValues(result: SlabFEMResult, data: { elementId: number; value?: number }[], valueKey?: string): Map<number, number> {
      const elemIdMap = new Map<number, number[]>();
      for (const e of result.mesh.elements) elemIdMap.set(e.id, e.nodeIds);
      const accum = new Map<number, number[]>();
      for (const item of data) {
        const nodeIds = elemIdMap.get(item.elementId);
        if (!nodeIds) continue;
        const v = valueKey ? (item as any)[valueKey] : (item as any).value;
        if (v === undefined || !isFinite(v)) continue;
        for (const nid of nodeIds) {
          let arr = accum.get(nid);
          if (!arr) { arr = []; accum.set(nid, arr); }
          arr.push(v);
        }
      }
      const out = new Map<number, number>();
      for (const [nid, vals] of accum) {
        let sum = 0; for (let i = 0; i < vals.length; i++) sum += vals[i];
        out.set(nid, sum / vals.length);
      }
      return out;
    }

    const allVals: number[] = [];
    for (const r of slabs) {
      let nodeValues: Map<number, number>;
      switch (rt) {
        case 'deflection': {
          nodeValues = new Map<number, number>();
          for (const d of r.nodeDeflections) nodeValues.set(d.nodeId, Math.abs(-d.wz * 1000));
          for (const d of r.nodeDeflections) allVals.push(Math.abs(-d.wz * 1000));
          break;
        }
        case 'mx': { nodeValues = elemToNodeValues(r, r.momentMx); for (const m of r.momentMx) allVals.push(m.value); break; }
        case 'my': { nodeValues = elemToNodeValues(r, r.momentMy); for (const m of r.momentMy) allVals.push(m.value); break; }
        case 'mxy': { nodeValues = elemToNodeValues(r, r.momentMxy); for (const m of r.momentMxy) allVals.push(m.value); break; }
        case 'punching': {
          nodeValues = new Map<number, number>();
          for (const p of (r.columnPunching || [])) { nodeValues.set(p.nodeId, p.ratio); allVals.push(p.ratio); }
          break;
        }
        default: {
          const key = rt === 'stress_s1' ? 's1' : rt === 'stress_s2' ? 's2' : 'vm';
          nodeValues = elemToNodeValues(r, r.stresses, key);
          for (const s of r.stresses) { const v = (s as any)[key]; if (isFinite(v)) allVals.push(v); }
          break;
        }
      }
      perSlab.set(r.slabId, { nodeValues, globalMin: 0, globalMax: 0 });
    }

    if (rt === 'punching') { globalMin = 0; globalMax = 1; }
    else [globalMin, globalMax] = safeMinMax(allVals);

    for (const cd of perSlab.values()) { cd.globalMin = globalMin; cd.globalMax = globalMax; }
    return { perSlab, globalMin, globalMax };
  });

  get globalMinMx(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minMx < min) min = r.minMx; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxMx(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxMx > max) max = r.maxMx; }
    return max === -Infinity ? 0 : max;
  }

  get globalMinMy(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minMy < min) min = r.minMy; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxMy(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxMy > max) max = r.maxMy; }
    return max === -Infinity ? 0 : max;
  }

  get globalMinVx(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minVx !== undefined && r.minVx < min) min = r.minVx; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxVx(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxVx !== undefined && r.maxVx > max) max = r.maxVx; }
    return max === -Infinity ? 0 : max;
  }

  get globalMinVy(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minVy !== undefined && r.minVy < min) min = r.minVy; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxVy(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxVy !== undefined && r.maxVy > max) max = r.maxVy; }
    return max === -Infinity ? 0 : max;
  }

  get globalMinNx(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minNx !== undefined && r.minNx < min) min = r.minNx; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxNx(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxNx !== undefined && r.maxNx > max) max = r.maxNx; }
    return max === -Infinity ? 0 : max;
  }

  get globalMinNy(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minNy !== undefined && r.minNy < min) min = r.minNy; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxNy(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxNy !== undefined && r.maxNy > max) max = r.maxNy; }
    return max === -Infinity ? 0 : max;
  }

  get globalMinNxy(): number {
    let min = Infinity;
    for (const r of this.slabResults.values()) { if (r.minNxy !== undefined && r.minNxy < min) min = r.minNxy; }
    return min === Infinity ? 0 : min;
  }

  get globalMaxNxy(): number {
    let max = -Infinity;
    for (const r of this.slabResults.values()) { if (r.maxNxy !== undefined && r.maxNxy > max) max = r.maxNxy; }
    return max === -Infinity ? 0 : max;
  }

  setResults(results: SlabFEMResult[]): void {
    this._clearTimeout();
    const map = new Map<string, SlabFEMResult>();
    for (const r of results) map.set(r.slabId, r);
    this.slabResults = map;
    this.isComputing = false;
    this.progress = 1;
    this.error = null;
    if (results.length > 0) {
      this.showFEMContour = true;
      this.activeSlabId = results[0].slabId;
    }
  }

  setComputing(): void {
    this._clearTimeout();
    this.isComputing = true;
    this.progress = 0;
    this.error = null;
    this._refreshTimeout();
  }

  refreshTimeout(): void {
    this._refreshTimeout();
  }

  private _refreshTimeout(): void {
    this._clearTimeout();
    this._timeoutId = setTimeout(() => {
      if (this.isComputing) {
        this.isComputing = false;
        this.error = 'FEM computation timed out after 120s — try increasing mesh size or reducing slab area';
      }
    }, 120000);
  }

  setProgress(p: number): void {
    this.progress = p;
  }

  setError(msg: string): void {
    this._clearTimeout();
    this.error = msg;
    this.isComputing = false;
    this.progress = 0;
  }

  clear(): void {
    this._clearTimeout();
    this.slabResults = new Map();
    this.isComputing = false;
    this.progress = 0;
    this.error = null;
    this.warnings = [];
    this.disconnectedIds = new Set();
    this.showFEMContour = false;
    this.activeSlabId = null;
  }

  private _clearTimeout(): void {
    if (this._timeoutId !== null) { clearTimeout(this._timeoutId); this._timeoutId = null; }
  }
}

export const femState = new FEMResultState();
