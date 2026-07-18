let API_BASE = (typeof window !== 'undefined' && (window as any).__RESLO_API__) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:8000';

export function setApiBase(url: string) { API_BASE = url; }
export function getApiBase() { return API_BASE; }

function isNgrokUrl(url: string) { return url.includes('ngrok'); }

async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (isNgrokUrl(API_BASE)) headers.set('ngrok-skip-browser-warning', 'true');
  return fetch(url, { ...init, headers });
}

interface PyNode { id: number; x: number; y: number }
interface PyElement { id: number; nodeIds: number[]; area: number }
interface PyMesh { nodeCount: number; elementCount: number; nodes: PyNode[]; elements: PyElement[]; minAngle: number; maxAspectRatio: number; meshQuality: string; unconnectedNodeIds?: number[] }

interface PyNodeDeflection { nodeId: number; wz: number; rx: number; ry: number }
interface PyElementMoment { elementId: number; mx: number; my: number; mxy: number; m1: number; m2: number; angle: number }
interface PyElementStress { elementId: number; s1: number; s2: number; vm: number; mx: number; my: number; mxy: number }

interface PyPunchingStress {
  nodeId: number; force_kN: number; stress_MPa: number;
  capacity_MPa: number; ratio: number; status: string;
}

interface PyElementShear {
  elementId: number; vx: number; vy: number; v1: number; angle: number;
}

interface PyElementMembraneForce {
  elementId: number; nx: number; ny: number; nxy: number; n1: number; n2: number; angle: number;
}

interface PyAnalysisResult {
  success: boolean; nodeDeflections: PyNodeDeflection[]; elementMoments: PyElementMoment[];
  elementStresses: PyElementStress[]; elementShears?: PyElementShear[];
  elementMembraneForces?: PyElementMembraneForce[]; columnPunching?: PyPunchingStress[];
  minWz: number; maxWz: number;
  minMx: number; maxMx: number; minMy: number; maxMy: number;
  minVx?: number; maxVx?: number; minVy?: number; maxVy?: number;
  minNx?: number; maxNx?: number; minNy?: number; maxNy?: number; minNxy?: number; maxNxy?: number;
  crX?: number; crY?: number;
  error?: string;
}

export async function healthCheck(): Promise<boolean> {
  try { const r = await fetchApi(`${API_BASE}/api/health`); return r.ok; }
  catch { return false; }
}

export class PyApiError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PyApiError'; }
}

function computePartitionWallSegments(
  nonStructuralWalls?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; thickness?: number; height?: number; partitionUnitWeight?: number }[],
  polylineNonStructuralWalls?: { vertices: { x: number; y: number }[]; thickness?: number; height?: number; partitionUnitWeight?: number }[]
): { startX: number; startY: number; endX: number; endY: number; lineLoad: number }[] {
  const segments: { startX: number; startY: number; endX: number; endY: number; lineLoad: number }[] = [];
  if (nonStructuralWalls) {
    for (const w of nonStructuralWalls) {
      const ll = (w.partitionUnitWeight ?? 25) * (w.thickness ?? 0.15) * (w.height ?? 3.0);
      segments.push({ startX: w.startPoint.x, startY: w.startPoint.y, endX: w.endPoint.x, endY: w.endPoint.y, lineLoad: ll });
    }
  }
  if (polylineNonStructuralWalls) {
    for (const pw of polylineNonStructuralWalls) {
      const ll = (pw.partitionUnitWeight ?? 25) * (pw.thickness ?? 0.15) * (pw.height ?? 3.0);
      for (let i = 0; i < pw.vertices.length - 1; i++) {
        segments.push({ startX: pw.vertices[i].x, startY: pw.vertices[i].y, endX: pw.vertices[i + 1].x, endY: pw.vertices[i + 1].y, lineLoad: ll });
      }
    }
  }
  return segments;
}

export async function meshAndAnalyze(
  slabPolygon: { vertices: { x: number; y: number }[]; thickness: number; uniformLoad: number; partitionLoad: number; elasticModulus: number },
  walls: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; thickness?: number; height?: number; boundaryCondition?: string }[],
  columns: { position: { x: number; y: number }; width: number; depth: number; height: number; elasticModulus: number; shape?: 'rectangular' | 'circular'; diameter?: number; boundaryCondition?: string }[],
  meshSize: number, poissonRatio: number,
  beams?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; width: number; depth: number; elasticModulus: number }[],
  dropPanels: { vertices: { x: number; y: number }[]; drop: number }[] = [],
  nonStructuralWalls?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; thickness?: number; height?: number; partitionUnitWeight?: number }[],
  polylineNonStructuralWalls?: { vertices: { x: number; y: number }[]; thickness?: number; height?: number; partitionUnitWeight?: number }[]
): Promise<{ mesh: { nodes: PyNode[]; elements: PyElement[] }; result: PyAnalysisResult; slabId: string; warnings: string[]; disconnectedIds: string[] }> {
  const geometry: any = {
    vertices: slabPolygon.vertices,
    walls: walls.map(w => ({ startPoint: w.startPoint, endPoint: w.endPoint })),
    beams: (beams || []).map(b => ({ startPoint: b.startPoint, endPoint: b.endPoint }))
  };

  const meshReq = { geometry, meshSize };
  const mr = await fetchApi(`${API_BASE}/api/mesh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meshReq)
  });
  if (!mr.ok) throw new PyApiError(`Mesh API ${mr.status}`);
  const meshData = await mr.json();
  if (!meshData.success || !meshData.mesh) throw new PyApiError(`Mesh failed: ${meshData.error}`);

  const mesh: PyMesh = meshData.mesh;
  const tol = 0.05;
  const wallNodeIds: number[] = [];
  for (const n of mesh.nodes) {
    for (const w of walls) {
      const dx = w.endPoint.x - w.startPoint.x, dy = w.endPoint.y - w.startPoint.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      const t = ((n.x - w.startPoint.x) * dx + (n.y - w.startPoint.y) * dy) / len2;
      if (t >= 0 && t <= 1) {
        const px = w.startPoint.x + t * dx, py = w.startPoint.y + t * dy;
        if (Math.hypot(n.x - px, n.y - py) < tol) { wallNodeIds.push(n.id); break; }
      }
    }
  }

  const colNodeIds: number[] = [];
  const colHeights: number[] = [];
  const colStiffnesses: number[] = [];
  const colWidths: number[] = [];
  const colDepths: number[] = [];
  const colShapes: string[] = [];
  const colDiameters: number[] = [];
  const COL_SNAP_TOL = 0.5;
  const skippedColumns: number[] = [];
  const skippedColumnIds: string[] = [];
  for (let ci = 0; ci < columns.length; ci++) {
    const c = columns[ci] as any;
    let best = mesh.nodes[0], bestD = Infinity;
    for (const n of mesh.nodes) {
      const d = Math.hypot(n.x - c.position.x, n.y - c.position.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (bestD > COL_SNAP_TOL) {
      skippedColumns.push(ci + 1);
      skippedColumnIds.push(c.id || `Column ${ci + 1}`);
      continue;
    }
    colNodeIds.push(best.id);
    colHeights.push(c.height || 3);
    const w = c.width || 0.3;
    const dp = c.depth || 0.3;
    colWidths.push(w);
    colDepths.push(dp);
    const Ix = dp * w**3 / 12;
    const Iy = w * dp**3 / 12;
    const I = (Ix + Iy) / 2;
    const E_col = (c.elasticModulus || 25e6) * 1000; // kPa → Pa
    const H = c.height || 3.0;
    colStiffnesses.push(4 * E_col * I / H);
    colShapes.push(c.shape || 'rectangular');
    colDiameters.push((c.diameter || 500) / 1000);
  }
  if (skippedColumns.length > 0) {
    console.warn(`Columns ${skippedColumns.join(', ')} are outside the slab mesh (> ${COL_SNAP_TOL}m) and were skipped.`);
  }

  const concreteDensity = 25; // kN/m³
  const slabThickness = slabPolygon.thickness || 0.2;
  const selfWeight = concreteDensity * slabThickness;

  // Beam data: snap endpoints to mesh nodes
  const beamNodeIdA: number[] = [];
  const beamNodeIdB: number[] = [];
  const beamWidths: number[] = [];
  const beamDepths: number[] = [];
  const beamElasticModuli: number[] = [];
  if (beams) {
    for (const b of beams) {
      let bestA = mesh.nodes[0], bestDA = Infinity;
      let bestB = mesh.nodes[0], bestDB = Infinity;
      for (const n of mesh.nodes) {
        const dA = Math.hypot(n.x - b.startPoint.x, n.y - b.startPoint.y);
        const dB = Math.hypot(n.x - b.endPoint.x, n.y - b.endPoint.y);
        if (dA < bestDA) { bestDA = dA; bestA = n; }
        if (dB < bestDB) { bestDB = dB; bestB = n; }
      }
      if (bestA.id !== bestB.id) {
        beamNodeIdA.push(bestA.id);
        beamNodeIdB.push(bestB.id);
        beamWidths.push(b.width || 0.3);
        beamDepths.push(b.depth || 0.45);
        beamElasticModuli.push((b.elasticModulus || 25e6) * 1000);
      }
    }
  }

  const arBody: any = {
    mesh, thickness: slabThickness,
    elasticModulus: slabPolygon.elasticModulus ? slabPolygon.elasticModulus * 1000 : 25e9, poissonRatio,
    uniformLoad: (slabPolygon.uniformLoad || 5.0) + (slabPolygon.partitionLoad ?? 0), selfWeight,
    wallNodeIds: [...new Set(wallNodeIds)],
    wallStartPoints: walls.map(w => w.startPoint),
    wallEndPoints: walls.map(w => w.endPoint),
    wallThicknesses: walls.map(w => w.thickness ?? 0.25),
    wallHeights: walls.map(w => w.height ?? 3.0),
    columnNodeIds: colNodeIds,
    columnHeights: colHeights, columnStiffnesses: colStiffnesses,
    columnWidths: colWidths, columnDepths: colDepths,
    columnShapes: colShapes, columnDiameters: colDiameters,
    columnBoundaryConditions: columns.map(c => c.boundaryCondition || 'fixed-fixed'),
    wallBoundaryConditions: walls.map(w => w.boundaryCondition || 'fixed-free'),
    beamNodeIdA, beamNodeIdB, beamWidths, beamDepths, beamElasticModuli,
    dropPanels: dropPanels.map(dp => ({ vertices: dp.vertices, drop: dp.drop })),
    partitionWallSegments: computePartitionWallSegments(nonStructuralWalls, polylineNonStructuralWalls)
  };

  if (colNodeIds.length === 0 && wallNodeIds.length === 0) {
    throw new PyApiError(
      'No column or wall supports found on the slab mesh. ' +
      'Please place at least one column or wall INSIDE the slab polygon, then re-run the analysis.'
    );
  }

  // ── Connectivity validation ──
  const warnings: string[] = [];
  if (skippedColumns.length > 0) {
    warnings.push(`Column${skippedColumns.length > 1 ? 's' : ''} ${skippedColumns.join(', ')} ${skippedColumns.length > 1 ? 'are' : 'is'} outside the slab mesh (>${COL_SNAP_TOL}m away) and ${skippedColumns.length > 1 ? 'were' : 'was'} skipped.`);
  }

  // Check wall connectivity: how many mesh nodes each wall segment found
  const wallConnectResults: { idx: number; nodesFound: number }[] = [];
  for (let wi = 0; wi < walls.length; wi++) {
    const w = walls[wi];
    const dx = w.endPoint.x - w.startPoint.x, dy = w.endPoint.y - w.startPoint.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) { wallConnectResults.push({ idx: wi, nodesFound: 0 }); continue; }
    let count = 0;
    for (const n of mesh.nodes) {
      const t = ((n.x - w.startPoint.x) * dx + (n.y - w.startPoint.y) * dy) / len2;
      if (t >= -0.01 && t <= 1.01) {
        const px = w.startPoint.x + Math.max(0, Math.min(1, t)) * dx;
        const py = w.startPoint.y + Math.max(0, Math.min(1, t)) * dy;
        if (Math.hypot(n.x - px, n.y - py) < tol) { count++; }
      }
    }
    wallConnectResults.push({ idx: wi, nodesFound: count });
  }
  const disconnectedWalls = wallConnectResults.filter(w => w.nodesFound === 0);
  const disconnectedWallIds: string[] = [];
  if (disconnectedWalls.length > 0) {
    const wallLabels = disconnectedWalls.map(w => {
      const wall = walls[w.idx] as any;
      const lbl = wall.label || `Wall ${w.idx + 1}`;
      disconnectedWallIds.push(wall.id || lbl);
      return lbl;
    });
    warnings.push(`Wall${disconnectedWalls.length > 1 ? 's' : ''} ${wallLabels.join(', ')} ${disconnectedWalls.length > 1 ? 'have' : 'has'} no mesh nodes along its length — it may be outside the slab.`);
  }

  if (mesh.unconnectedNodeIds && mesh.unconnectedNodeIds.length > 0) {
    warnings.push(`${mesh.unconnectedNodeIds.length} node${mesh.unconnectedNodeIds.length > 1 ? 's' : ''} (ID: ${mesh.unconnectedNodeIds.join(', ')}) in the mesh ${mesh.unconnectedNodeIds.length > 1 ? 'are' : 'is'} not connected to any slab elements. These nodes will be highlighted on the canvas in red and automatically constrained to prevent solver errors.`);
  }

  const disconnectedIds = [...skippedColumnIds, ...disconnectedWallIds];

  if (warnings.length > 0) {
    console.warn('[Reslo FEM] Connectivity warnings:\n' + warnings.join('\n'));
  }

  const ar = await fetchApi(`${API_BASE}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arBody)
  });
  if (!ar.ok) throw new PyApiError(`Analyze API ${ar.status}`);
  const result: PyAnalysisResult = await ar.json();
  if (!result.success) throw new PyApiError(`Analysis failed: ${result.error}`);

  return { mesh, result, slabId: slabPolygon.vertices.length > 0 ? `slab_${Date.now()}` : 'slab_0', warnings, disconnectedIds };
}

function toFrontendResult(slabId: string, mesh: any, result: any): any {
  const nodeDeflections = result.nodeDeflections.map((d: any) => ({ nodeId: d.nodeId, wz: d.wz }));
  const momentMx = result.elementMoments.map((m: any) => ({ elementId: m.elementId, value: m.mx }));
  const momentMy = result.elementMoments.map((m: any) => ({ elementId: m.elementId, value: m.my }));
  const momentMxy = result.elementMoments.map((m: any) => ({ elementId: m.elementId, value: m.mxy }));
  const stresses = (result.elementStresses || []).map((s: any) => ({
    elementId: s.elementId, s1: s.s1, s2: s.s2, angle: s.angle, vm: s.vm
  }));
  const shears = (result.elementShears || []).map((s: any) => ({
    elementId: s.elementId, vx: s.vx, vy: s.vy, v1: s.v1, angle: s.angle
  }));
  const membraneForces = (result.elementMembraneForces || []).map((m: any) => ({
    elementId: m.elementId, nx: m.nx, ny: m.ny, nxy: m.nxy, n1: m.n1, n2: m.n2, angle: m.angle
  }));
  const columnPunching = (result.columnPunching || []).map((p: any) => ({
    nodeId: p.nodeId, force_kN: p.force_kN, stress_MPa: p.stress_MPa,
    capacity_MPa: p.capacity_MPa, ratio: p.ratio, status: p.status
  }));
  const vxVals = shears.map((s: any) => s.vx);
  const vyVals = shears.map((s: any) => s.vy);
  const nxVals = membraneForces.map((m: any) => m.nx);
  const nyVals = membraneForces.map((m: any) => m.ny);
  const nxyVals = membraneForces.map((m: any) => m.nxy);
  return {
    slabId,
    mesh: {
      nodes: mesh.nodes.map((n: any) => ({ id: n.id, x: n.x, y: n.y })),
      elements: mesh.elements.map((e: any) => ({ id: e.id, nodeIds: e.nodeIds, area: e.area || 0 })),
      meshSize: 0,
      unconnectedNodeIds: mesh.unconnectedNodeIds || [],
    },
    nodeDeflections, momentMx, momentMy, momentMxy, stresses, shears, membraneForces, columnPunching,
    minWz: nodeDeflections.length ? Math.min(...nodeDeflections.map((d: any) => d.wz)) : 0,
    maxWz: nodeDeflections.length ? Math.max(...nodeDeflections.map((d: any) => d.wz)) : 0,
    minMx: result.minMx ?? Math.min(...momentMx.map((m: any) => m.value)),
    maxMx: result.maxMx ?? Math.max(...momentMx.map((m: any) => m.value)),
    minMy: result.minMy ?? Math.min(...momentMy.map((m: any) => m.value)),
    maxMy: result.maxMy ?? Math.max(...momentMy.map((m: any) => m.value)),
    minVx: result.minVx ?? (vxVals.length ? Math.min(...vxVals) : 0),
    maxVx: result.maxVx ?? (vxVals.length ? Math.max(...vxVals) : 0),
    minVy: result.minVy ?? (vyVals.length ? Math.min(...vyVals) : 0),
    maxVy: result.maxVy ?? (vyVals.length ? Math.max(...vyVals) : 0),
    minNx: result.minNx ?? (nxVals.length ? Math.min(...nxVals) : 0),
    maxNx: result.maxNx ?? (nxVals.length ? Math.max(...nxVals) : 0),
    minNy: result.minNy ?? (nyVals.length ? Math.min(...nyVals) : 0),
    maxNy: result.maxNy ?? (nyVals.length ? Math.max(...nyVals) : 0),
    minNxy: result.minNxy ?? (nxyVals.length ? Math.min(...nxyVals) : 0),
    maxNxy: result.maxNxy ?? (nxyVals.length ? Math.max(...nxyVals) : 0),
    crX: result.crX,
    crY: result.crY,
  };
}

export async function analyzeSlabViaApi(
  slab: { id?: string; vertices: { x: number; y: number }[]; thickness: number; uniformLoad: number; partitionLoad: number; elasticModulus: number },
  columns: { position: { x: number; y: number }; width: number; depth: number; height: number; elasticModulus: number; shape?: 'rectangular' | 'circular'; diameter?: number; boundaryCondition?: string }[],
  walls: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; elasticModulus: number; thickness?: number; height?: number; boundaryCondition?: string }[],
  polylineWalls: { vertices: { x: number; y: number }[]; thickness: number; height: number; elasticModulus: number; shearModulus?: number; concreteDensity?: number; boundaryCondition?: string }[],
  meshSize: number, poissonRatio: number,
  beams: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; width: number; depth: number; elasticModulus: number }[] = [],
  dropPanels: { vertices: { x: number; y: number }[]; drop: number }[] = [],
  nonStructuralWalls: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; thickness?: number; height?: number; partitionUnitWeight?: number }[] = [],
  polylineNonStructuralWalls: { vertices: { x: number; y: number }[]; thickness?: number; height?: number; partitionUnitWeight?: number }[] = []
): Promise<any> {
  const allWalls = [...walls];
  const COLLINEAR_TOL = 0.001745; // 0.1° — same tolerance as mathEngine.ts
  for (const pw of polylineWalls) {
    // Build raw segment list (filter zero-length)
    const rawSegs: { x1: number; y1: number; x2: number; y2: number; alpha: number }[] = [];
    for (let i = 0; i < pw.vertices.length - 1; i++) {
      const a = pw.vertices[i], b = pw.vertices[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-10) continue;
      rawSegs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, alpha: Math.atan2(dy, dx) });
    }
    // Merge collinear runs into piers (matches mathEngine.ts pier logic)
    let si = 0;
    while (si < rawSegs.length) {
      const alpha0 = rawSegs[si].alpha;
      const pierX1 = rawSegs[si].x1, pierY1 = rawSegs[si].y1;
      let sj = si;
      while (sj + 1 < rawSegs.length) {
        const da = Math.abs(rawSegs[sj + 1].alpha - alpha0);
        if (Math.min(da, Math.PI - da) > COLLINEAR_TOL) break;
        sj++;
      }
      allWalls.push({
        startPoint: { x: pierX1, y: pierY1 },
        endPoint: { x: rawSegs[sj].x2, y: rawSegs[sj].y2 },
        elasticModulus: pw.elasticModulus,
        thickness: pw.thickness, height: pw.height,
        boundaryCondition: pw.boundaryCondition
      } as any);
      si = sj + 1;
    }
  }
  const { mesh, result } = await meshAndAnalyze(slab, allWalls, columns, meshSize, poissonRatio, beams, dropPanels, nonStructuralWalls, polylineNonStructuralWalls);
  return toFrontendResult(slab.id || 'slab_0', mesh, result);
}
