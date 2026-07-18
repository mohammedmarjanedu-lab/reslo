import type { Point2D, ColumnElement, ShearWallElement, SlabPolygon, GlobalMetrics } from './types';
import { computeGlobalMetrics } from './mathEngine';

// ─────────────────────────────────────────────────────────────
// Graph types — compact representation of structural model
// ─────────────────────────────────────────────────────────────

export type GraphNodeType = 'column' | 'wall_end' | 'wall_start' | 'slab_vtx' | 'cm' | 'cr';

export interface GraphNode {
  i: number;          // id (integer, compact)
  x: number;
  y: number;
  t: GraphNodeType;   // type
  p?: string;         // properties (comma-sep key=val)
}

export interface GraphEdge {
  i: number;          // id
  s: number;          // source node index
  t: number;          // target node index
  k?: string;         // kind: 'wall' | 'slab' | 'virtual'
  p?: string;         // properties
}

export interface StructuralGraph {
  v: number;             // version
  n: GraphNode[];        // nodes
  e: GraphEdge[];        // edges
  m: {                   // metrics
    cm?: [number, number];
    cr?: [number, number];
    ex?: number;
    ey?: number;
    tw?: number;         // total weight kN
    tx?: number;         // torsional ratio X (pure)
    ty?: number;         // torsional ratio Y (pure)
    tax?: number;        // torsional ratio X with accidental (ea+5%)
    tay?: number;        // torsional ratio Y with accidental (ea+5%)
    ir?: boolean;        // has irregularity
    ei?: boolean;        // has extreme irregularity
  };
  s?: {                  // scale info
    ppm: number;
    img?: [number, number]; // image natural dimensions
  };
}

// ─────────────────────────────────────────────────────────────
// Builder — converts structural model to compact graph
// ─────────────────────────────────────────────────────────────

let _nextNodeId = 1;
let _nextEdgeId = 1;

function resetIds() {
  _nextNodeId = 1;
  _nextEdgeId = 1;
}

function node(t: GraphNodeType, x: number, y: number, props?: Record<string, string | number>): GraphNode {
  const p = props ? Object.entries(props).map(([k, v]) => `${k}=${v}`).join(',') : undefined;
  return { i: _nextNodeId++, x: +x.toFixed(3), y: +y.toFixed(3), t, p };
}

function edge(s: number, t: number, kind: string, props?: Record<string, string | number>): GraphEdge {
  const p = props ? Object.entries(props).map(([k, v]) => `${k}=${v}`).join(',') : undefined;
  return { i: _nextEdgeId++, s, t, k: kind, p };
}

export function buildGraph(
  slab: SlabPolygon | null,
  columns: ColumnElement[],
  walls: ShearWallElement[],
  ppm: number,
  imgW?: number,
  imgH?: number,
): StructuralGraph {
  resetIds();

  const n: GraphNode[] = [];
  const e: GraphEdge[] = [];
  let colNodes: number[] = [];
  let wallNodes: Map<string, { start: number; end: number }> = new Map();
  let slabNodes: number[] = [];

  // Column nodes
  for (const col of columns) {
    const ni = node('column', col.position.x, col.position.y, {
      w: col.width, d: col.depth, H: col.height, θ: +(col.rotation * 180 / Math.PI).toFixed(1),
      bc: col.boundaryCondition === 'fixed-free' ? 'ff' : 'fx',
    });
    n.push(ni);
    colNodes.push(ni.i);
  }

  // Wall nodes and edges
  for (const wall of walls) {
    const si = node('wall_start', wall.startPoint.x, wall.startPoint.y);
    const ei = node('wall_end', wall.endPoint.x, wall.endPoint.y);
    n.push(si, ei);
    wallNodes.set(wall.id, { start: si.i, end: ei.i });
    e.push(edge(si.i, ei.i, 'wall', { t: wall.thickness, H: wall.height }));
  }

  // Slab vertices
  if (slab && slab.vertices.length >= 3) {
    for (const v of slab.vertices) {
      const ni = node('slab_vtx', v.x, v.y);
      n.push(ni);
      slabNodes.push(ni.i);
    }
    for (let i = 0; i < slabNodes.length; i++) {
      const j = (i + 1) % slabNodes.length;
      e.push(edge(slabNodes[i], slabNodes[j], 'slab'));
    }
    // Hole vertices
    if (slab.holes) {
      for (const hole of slab.holes) {
        if (hole.length < 3) continue;
        const holeNodeIds: number[] = [];
        for (const v of hole) {
          const ni = node('slab_vtx', v.x, v.y, { hole: '' });
          n.push(ni);
          holeNodeIds.push(ni.i);
        }
        for (let i = 0; i < holeNodeIds.length; i++) {
          const j = (i + 1) % holeNodeIds.length;
          e.push(edge(holeNodeIds[i], holeNodeIds[j], 'slab'));
        }
      }
    }
  }

  // Metrics
  const metrics = computeGlobalMetrics(slab ? [slab] : [], columns, walls, [], []);

  // CM/CR nodes
  n.push(node('cm', metrics.cm.x, metrics.cm.y));
  n.push(node('cr', metrics.cr.x, metrics.cr.y));

  // Build result
  const graph: StructuralGraph = {
    v: 1,
    n,
    e,
    m: {
      cm: [+metrics.cm.x.toFixed(3), +metrics.cm.y.toFixed(3)],
      cr: [+metrics.cr.x.toFixed(3), +metrics.cr.y.toFixed(3)],
      ex: +metrics.ex.toFixed(3),
      ey: +metrics.ey.toFixed(3),
      tw: +metrics.totalWeight.toFixed(1),
      tx: +metrics.torsionalRatioX.toFixed(4),
      ty: +metrics.torsionalRatioY.toFixed(4),
      tax: +metrics.torsionalRatioWithAccidentalX.toFixed(4),
      tay: +metrics.torsionalRatioWithAccidentalY.toFixed(4),
      ir: metrics.hasTorsionalIrregularity,
      ei: metrics.hasExtremeTorsionalIrregularity,
    },
    s: {
      ppm: +ppm.toFixed(2),
      img: (imgW && imgH) ? [imgW, imgH] : undefined,
    },
  };

  return graph;
}

// ─────────────────────────────────────────────────────────────
// Serialization — ultra-compact string representation
// ─────────────────────────────────────────────────────────────

export function serializeGraph(graph: StructuralGraph): string {
  return JSON.stringify(graph);
}

export function deserializeGraph(json: string): StructuralGraph {
  return JSON.parse(json);
}

// ─────────────────────────────────────────────────────────────
// Token estimation (rough but conservative)
// ─────────────────────────────────────────────────────────────

const AVG_CHARS_PER_TOKEN = 4;

export function estimateTokens(graph: StructuralGraph): number {
  const json = serializeGraph(graph);
  return Math.ceil(json.length / AVG_CHARS_PER_TOKEN);
}

export function estimateTokensFromJson(json: string): number {
  return Math.ceil(json.length / AVG_CHARS_PER_TOKEN);
}

// ─────────────────────────────────────────────────────────────
// Compression levels for headroom integration
// ─────────────────────────────────────────────────────────────

export type CompressionLevel = 0 | 1 | 2 | 3;

export function compressGraph(graph: StructuralGraph, level: CompressionLevel): StructuralGraph {
  if (level === 0) return graph;

  const g = JSON.parse(JSON.stringify(graph)) as StructuralGraph;

  if (level >= 1) {
    // Round coordinates to fewer decimals
    for (const node of g.n) {
      node.x = +node.x.toFixed(1);
      node.y = +node.y.toFixed(1);
    }
    // Truncate slab vertices to first 6
    const slabVtx = g.n.filter(n => n.t === 'slab_vtx');
    if (slabVtx.length > 8) {
      const keep = slabVtx.slice(0, 8);
      const removeIds = new Set(slabVtx.slice(8).map(n => n.i));
      g.n = g.n.filter(n => !removeIds.has(n.i));
      g.e = g.e.filter(ed => !removeIds.has(ed.s) && !removeIds.has(ed.t));
    }
  }

  if (level >= 2) {
    // Remove slab entirely, keep only columns and walls
    g.n = g.n.filter(n => n.t !== 'slab_vtx');
    g.e = g.e.filter(ed => ed.k !== 'slab');
    // Remove per-node properties
    for (const node of g.n) delete node.p;
  }

  if (level >= 3) {
    // Keep only metrics and counts
    g.n = g.n.filter(n => n.t === 'cm' || n.t === 'cr');
    g.e = [];
    g.s = undefined;
  }

  return g;
}
