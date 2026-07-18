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
  const wallNodesCount = new Array(walls.length).fill(0);
  for (const n of mesh.nodes) {
    for (let wi = 0; wi < walls.length; wi++) {
      const w = walls[wi];
      const dx = w.endPoint.x - w.startPoint.x, dy = w.endPoint.y - w.startPoint.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      const t = ((n.x - w.startPoint.x) * dx + (n.y - w.startPoint.y) * dy) / len2;
      if (t >= -0.01 && t <= 1.01) {
        const px = w.startPoint.x + Math.max(0, Math.min(1, t)) * dx;
        const py = w.startPoint.y + Math.max(0, Math.min(1, t)) * dy;
        if (Math.hypot(n.x - px, n.y - py) < tol) {
          wallNodeIds.push(n.id);
          wallNodesCount[wi]++;
        }
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
  const colGrades: string[] = [];
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
    colGrades.push(c.concreteGrade || 'M25');
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
    elasticModulus: (slabPolygon.elasticModulus ? slabPolygon.elasticModulus * 1000 : 25e9) * (slabPolygon.crackingModifier ?? 0.25), poissonRatio,
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
    columnGrades: colGrades,
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

  const disconnectedWallIds: string[] = [];
  for (let wi = 0; wi < walls.length; wi++) {
    if (wallNodesCount[wi] === 0) {
      const wall = walls[wi] as any;
      const lbl = wall.label || `Wall ${wi + 1}`;
      disconnectedWallIds.push(wall.id || lbl);
    }
  }
  if (disconnectedWallIds.length > 0) {
    warnings.push(`Wall${disconnectedWallIds.length > 1 ? 's' : ''} ${disconnectedWallIds.join(', ')} ${disconnectedWallIds.length > 1 ? 'have' : 'has'} no mesh nodes along its length — it may be outside the slab.`);
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

export async function meshAndAnalyzeAllSlabs(
  slabs: any[],
  walls: any[],
  columns: any[],
  meshSize: number,
  poissonRatio: number,
  beams: any[] = [],
  dropPanels: any[] = [],
  nonStructuralWalls: any[] = [],
  polylineNonStructuralWalls: any[] = []
): Promise<{ results: any[]; warnings: string[]; disconnectedIds: string[] }> {
  if (slabs.length === 0) return { results: [], warnings: [], disconnectedIds: [] };

  // 1. Mesh all slabs individually via the backend mesh API
  interface SlabMeshData {
    slab: any;
    mesh: PyMesh;
  }
  const slabMeshes: SlabMeshData[] = [];
  for (const slab of slabs) {
    const geometry = {
      vertices: slab.vertices,
      walls: walls.map(w => ({ startPoint: w.startPoint, endPoint: w.endPoint })),
      beams: beams.map(b => ({ startPoint: b.startPoint, endPoint: b.endPoint }))
    };
    const meshReq = { geometry, meshSize };
    const mr = await fetchApi(`${API_BASE}/api/mesh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meshReq)
    });
    if (!mr.ok) throw new PyApiError(`Mesh API failed for slab ${slab.label || slab.id}: ${mr.status}`);
    const meshData = await mr.json();
    if (meshData.success && meshData.mesh) {
      slabMeshes.push({ slab, mesh: meshData.mesh });
    }
  }

  if (slabMeshes.length === 0) {
    return { results: [], warnings: ['No slabs could be meshed.'], disconnectedIds: [] };
  }

  // 2. Merge coincident nodes globally (identical tolerance to TypeScript solver)
  interface NodeRef {
    slabId: string;
    localId: number;
    x: number;
    y: number;
    globalIdx?: number;
  }
  const allNodes: NodeRef[] = [];
  for (const sm of slabMeshes) {
    for (const node of sm.mesh.nodes) {
      allNodes.push({ slabId: sm.slab.id, localId: node.id, x: node.x, y: node.y });
    }
  }

  allNodes.sort((a, b) => a.x - b.x);

  const mergeTol = meshSize * 0.1;
  const uniqueNodes: PyNode[] = [];

  for (const node of allNodes) {
    let foundIdx = -1;
    for (let u = uniqueNodes.length - 1; u >= 0; u--) {
      const un = uniqueNodes[u];
      if (node.x - un.x > mergeTol) break;
      if (Math.abs(node.y - un.y) < mergeTol) {
        foundIdx = u;
        break;
      }
    }
    if (foundIdx >= 0) {
      node.globalIdx = foundIdx;
    } else {
      const newIdx = uniqueNodes.length;
      uniqueNodes.push({ id: newIdx + 1, x: node.x, y: node.y }); // 1-indexed for backend
      node.globalIdx = newIdx;
    }
  }

  // Re-map slab elements to the global node IDs
  const globalElements: PyElement[] = [];
  let globalElemCounter = 1;
  const elementMap = new Map<string, Map<number, number>>(); // slabId -> localElemId -> globalElemId

  for (const sm of slabMeshes) {
    const localToGlobalElemMap = new Map<number, number>();
    const nodeMapForSlab = new Map<number, number>();
    for (const node of allNodes.filter(n => n.slabId === sm.slab.id)) {
      nodeMapForSlab.set(node.localId, node.globalIdx! + 1); // 1-indexed
    }

    for (const elem of sm.mesh.elements) {
      const globalNodeIds = elem.nodeIds.map(nid => nodeMapForSlab.get(nid)!);
      const globalElemId = globalElemCounter++;
      globalElements.push({
        id: globalElemId,
        nodeIds: globalNodeIds,
        area: elem.area || 0
      });
      localToGlobalElemMap.set(elem.id, globalElemId);
    }
    elementMap.set(sm.slab.id, localToGlobalElemMap);
  }

  const globalMesh = {
    nodeCount: uniqueNodes.length,
    elementCount: globalElements.length,
    nodes: uniqueNodes,
    elements: globalElements,
    minAngle: 30,
    maxAspectRatio: 1.5,
    meshQuality: 'High'
  };

  // 3. Support mapping on the global mesh
  const tol = 0.05;
  const wallNodeIds: number[] = [];
  const wallNodesCount = new Array(walls.length).fill(0);
  for (const n of uniqueNodes) {
    for (let wi = 0; wi < walls.length; wi++) {
      const w = walls[wi];
      const dx = w.endPoint.x - w.startPoint.x, dy = w.endPoint.y - w.startPoint.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      const t = ((n.x - w.startPoint.x) * dx + (n.y - w.startPoint.y) * dy) / len2;
      if (t >= -0.01 && t <= 1.01) {
        const px = w.startPoint.x + Math.max(0, Math.min(1, t)) * dx;
        const py = w.startPoint.y + Math.max(0, Math.min(1, t)) * dy;
        if (Math.hypot(n.x - px, n.y - py) < tol) {
          wallNodeIds.push(n.id);
          wallNodesCount[wi]++;
        }
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
  const colGrades: string[] = [];
  const COL_SNAP_TOL = 0.5;
  const skippedColumns: number[] = [];
  const skippedColumnIds: string[] = [];
  for (let ci = 0; ci < columns.length; ci++) {
    const c = columns[ci] as any;
    let best = uniqueNodes[0], bestD = Infinity;
    for (const n of uniqueNodes) {
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
    const E_col = (c.elasticModulus || 25e6) * 1000; // kPa -> Pa
    const H = c.height || 3.0;
    colStiffnesses.push(4 * E_col * I / H);
    colShapes.push(c.shape || 'rectangular');
    colDiameters.push((c.diameter || 500) / 1000);
    colGrades.push(c.concreteGrade || 'M25');
  }

  const primarySlab = slabs[0];
  const slabThickness = primarySlab.thickness || 0.2;
  const selfWeight = 25 * slabThickness;

  // Beam endpoints to global nodes
  const beamNodeIdA: number[] = [];
  const beamNodeIdB: number[] = [];
  const beamWidths: number[] = [];
  const beamDepths: number[] = [];
  const beamElasticModuli: number[] = [];
  for (const b of beams) {
    let bestA = uniqueNodes[0], bestDA = Infinity;
    let bestB = uniqueNodes[0], bestDB = Infinity;
    for (const n of uniqueNodes) {
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

  // Build drop panel list from actual panels + other slabs to support varying thickness in the global mesh
  const activeDropPanels = [...dropPanels.map(dp => ({ vertices: dp.vertices, drop: dp.drop }))];
  for (let i = 1; i < slabs.length; i++) {
    const s = slabs[i];
    activeDropPanels.push({
      vertices: s.vertices,
      drop: s.thickness
    });
  }

  const arBody: any = {
    mesh: globalMesh,
    thickness: slabThickness,
    elasticModulus: (primarySlab.elasticModulus ? primarySlab.elasticModulus * 1000 : 25e9) * (primarySlab.crackingModifier ?? 0.25),
    poissonRatio,
    uniformLoad: (primarySlab.uniformLoad || 5.0) + (primarySlab.partitionLoad ?? 0),
    selfWeight,
    wallNodeIds: [...new Set(wallNodeIds)],
    wallStartPoints: walls.map(w => w.startPoint),
    wallEndPoints: walls.map(w => w.endPoint),
    wallThicknesses: walls.map(w => w.thickness ?? 0.25),
    wallHeights: walls.map(w => w.height ?? 3.0),
    columnNodeIds: colNodeIds,
    columnHeights: colHeights,
    columnStiffnesses: colStiffnesses,
    columnWidths: colWidths,
    columnDepths: colDepths,
    columnShapes: colShapes,
    columnDiameters: colDiameters,
    columnGrades: colGrades,
    columnBoundaryConditions: columns.map(c => c.boundaryCondition || 'fixed-fixed'),
    wallBoundaryConditions: walls.map(w => w.boundaryCondition || 'fixed-free'),
    beamNodeIdA,
    beamNodeIdB,
    beamWidths,
    beamDepths,
    beamElasticModuli,
    dropPanels: activeDropPanels,
    partitionWallSegments: computePartitionWallSegments(nonStructuralWalls, polylineNonStructuralWalls)
  };

  const warnings: string[] = [];
  if (skippedColumns.length > 0) {
    warnings.push(`Column${skippedColumns.length > 1 ? 's' : ''} ${skippedColumns.join(', ')} outside the slab mesh.`);
  }

  const ar = await fetchApi(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arBody)
  });
  if (!ar.ok) throw new PyApiError(`Analyze API failed: ${ar.status}`);
  const result: PyAnalysisResult = await ar.json();
  if (!result.success) throw new PyApiError(`Analysis failed: ${result.error}`);

  // 4. Map global results back to individual SlabFEMResult outputs per slab
  const results: any[] = [];
  for (const sm of slabMeshes) {
    const localNodeMap = new Map<number, number>();
    for (const node of allNodes.filter(n => n.slabId === sm.slab.id)) {
      localNodeMap.set(node.localId, node.globalIdx! + 1); // 1-indexed
    }

    const localToGlobalElemMap = elementMap.get(sm.slab.id)!;

    const nodeDeflections = sm.mesh.nodes.map(n => {
      const gNodeId = localNodeMap.get(n.id)!;
      const gDef = result.nodeDeflections.find(d => d.nodeId === gNodeId);
      return { nodeId: n.id, wz: gDef ? gDef.wz : 0 };
    });

    const momentMx = sm.mesh.elements.map(e => {
      const gElemId = localToGlobalElemMap.get(e.id)!;
      const gMom = result.elementMoments.find(m => m.elementId === gElemId);
      return { elementId: e.id, value: gMom ? gMom.mx : 0 };
    });

    const momentMy = sm.mesh.elements.map(e => {
      const gElemId = localToGlobalElemMap.get(e.id)!;
      const gMom = result.elementMoments.find(m => m.elementId === gElemId);
      return { elementId: e.id, value: gMom ? gMom.my : 0 };
    });

    const momentMxy = sm.mesh.elements.map(e => {
      const gElemId = localToGlobalElemMap.get(e.id)!;
      const gMom = result.elementMoments.find(m => m.elementId === gElemId);
      return { elementId: e.id, value: gMom ? gMom.mxy : 0 };
    });

    const stresses = (result.elementStresses || []).filter(s => {
      const gElemId = localToGlobalElemMap.get(sm.mesh.elements[0]?.id); // check range
      return localToGlobalElemMap.has(sm.mesh.elements.find(e => localToGlobalElemMap.get(e.id) === s.elementId)?.id || -1);
    }).map(s => {
      const localElemId = sm.mesh.elements.find(e => localToGlobalElemMap.get(e.id) === s.elementId)!.id;
      return { elementId: localElemId, s1: s.s1, s2: s.s2, angle: s.angle, vm: s.vm };
    });

    const shears = (result.elementShears || []).filter(s => {
      return localToGlobalElemMap.has(sm.mesh.elements.find(e => localToGlobalElemMap.get(e.id) === s.elementId)?.id || -1);
    }).map(s => {
      const localElemId = sm.mesh.elements.find(e => localToGlobalElemMap.get(e.id) === s.elementId)!.id;
      return { elementId: localElemId, vx: s.vx, vy: s.vy, v1: s.v1, angle: s.angle };
    });

    const columnPunching = (result.columnPunching || []).filter(p => {
      return localNodeMap.has(sm.mesh.nodes.find(n => localNodeMap.get(n.id) === p.nodeId)?.id || -1);
    }).map(p => {
      const localNodeId = sm.mesh.nodes.find(n => localNodeMap.get(n.id) === p.nodeId)!.id;
      return { nodeId: localNodeId, force_kN: p.force_kN, stress_MPa: p.stress_MPa, capacity_MPa: p.capacity_MPa, ratio: p.ratio, status: p.status };
    });

    const vxVals = shears.map(s => s.vx);
    const vyVals = shears.map(s => s.vy);

    results.push({
      slabId: sm.slab.id,
      mesh: {
        nodes: sm.mesh.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
        elements: sm.mesh.elements.map(e => ({ id: e.id, nodeIds: e.nodeIds, area: e.area || 0 })),
        meshSize: 0,
        unconnectedNodeIds: sm.mesh.unconnectedNodeIds || [],
      },
      nodeDeflections,
      momentMx,
      momentMy,
      momentMxy,
      stresses,
      shears,
      columnPunching,
      minWz: nodeDeflections.length ? Math.min(...nodeDeflections.map(d => d.wz)) : 0,
      maxWz: nodeDeflections.length ? Math.max(...nodeDeflections.map(d => d.wz)) : 0,
      minMx: Math.min(...momentMx.map(m => m.value)),
      maxMx: Math.max(...momentMx.map(m => m.value)),
      minMy: Math.min(...momentMy.map(m => m.value)),
      maxMy: Math.max(...momentMy.map(m => m.value)),
      minVx: vxVals.length ? Math.min(...vxVals) : 0,
      maxVx: vxVals.length ? Math.max(...vxVals) : 0,
      minVy: vyVals.length ? Math.min(...vyVals) : 0,
      maxVy: vyVals.length ? Math.max(...vyVals) : 0,
      crX: result.crX,
      crY: result.crY
    });
  }

  return { results, warnings, disconnectedIds: skippedColumnIds };
}

