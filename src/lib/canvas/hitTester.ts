import type { Point2D, ColumnElement, ShearWallElement, PolylineWallElement, BeamElement, SlabPolygon, Dimension, DropPanelElement, NonStructuralWallElement, PolylineNonStructuralWallElement } from '../engine/types';
import { distance, pointToSegmentDistance, pointInPolygon } from '../engine/mathEngine';

const SLAB_EDGE_TOLERANCE = 0.30;
const SLAB_VERTEX_TOLERANCE = 0.12;

export interface HitResult {
  type: 'column' | 'wall' | 'wallStart' | 'wallEnd' | 'wallMid' | 'beam' | 'beamStart' | 'beamEnd' | 'beamMid' | 'polylineWall' | 'polylineWallVertex' | 'nonStructuralWall' | 'nonStructuralWallStart' | 'nonStructuralWallEnd' | 'nonStructuralWallMid' | 'polylineNonStructuralWall' | 'polylineNonStructuralWallVertex' | 'slab' | 'slabVertex' | 'slabEdge' | 'slabHoleEdge' | 'slabHoleVertex' | 'slabHole' | 'dropPanel' | 'dropPanelVertex' | 'dropPanelEdge' | 'none';
  id: string;
  point: Point2D;
  vertexIndex?: number;
  holeIndex?: number;
}

const HANDLE_WORLD = 0.15;
const SEGMENT_WORLD = 0.10;

function filterHidden<T extends { id: string }>(elements: T[], hiddenIds: Set<string>): T[] {
  return hiddenIds.size > 0 ? elements.filter(e => !hiddenIds.has(e.id)) : elements;
}

export function hitTestColumns(point: Point2D, columns: ColumnElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  let closest: ColumnElement | null = null;
  let closestDist = SEGMENT_WORLD;
  for (const col of filterHidden(columns, hiddenIds)) {
    const d = distance(point, col.position);
    const halfDim = Math.max(col.width, col.depth) / 2;
    const hitRadius = Math.max(SEGMENT_WORLD, halfDim + 0.08);
    if (d < hitRadius && d < closestDist) {
      closest = col;
      closestDist = d;
    }
  }
  if (closest) return { type: 'column', id: closest.id, point: closest.position };
  return null;
}

export function hitTestWalls(point: Point2D, walls: ShearWallElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const wall of filterHidden(walls, hiddenIds)) {
    if (distance(point, wall.startPoint) < HANDLE_WORLD)
      return { type: 'wallStart', id: wall.id, point: wall.startPoint };
    if (distance(point, wall.endPoint) < HANDLE_WORLD)
      return { type: 'wallEnd', id: wall.id, point: wall.endPoint };
    const midX = (wall.startPoint.x + wall.endPoint.x) / 2;
    const midY = (wall.startPoint.y + wall.endPoint.y) / 2;
    if (distance(point, { x: midX, y: midY }) < HANDLE_WORLD)
      return { type: 'wallMid', id: wall.id, point: { x: midX, y: midY } };
    if (pointToSegmentDistance(point, wall.startPoint, wall.endPoint) < SEGMENT_WORLD)
      return { type: 'wall', id: wall.id, point: { x: midX, y: midY } };
  }
  return null;
}

export function hitTestPolylineWalls(point: Point2D, walls: PolylineWallElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const wall of filterHidden(walls, hiddenIds)) {
    for (let i = 0; i < wall.vertices.length; i++) {
      if (distance(point, wall.vertices[i]) < HANDLE_WORLD)
        return { type: 'polylineWallVertex', id: wall.id, point: wall.vertices[i], vertexIndex: i };
    }
    for (let i = 0; i < wall.vertices.length - 1; i++) {
      if (pointToSegmentDistance(point, wall.vertices[i], wall.vertices[i + 1]) < SEGMENT_WORLD)
        return { type: 'polylineWall', id: wall.id, point: { ...point } };
    }
  }
  return null;
}

export function hitTestNonStructuralWalls(point: Point2D, walls: NonStructuralWallElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const wall of filterHidden(walls, hiddenIds)) {
    if (distance(point, wall.startPoint) < HANDLE_WORLD)
      return { type: 'nonStructuralWallStart', id: wall.id, point: wall.startPoint };
    if (distance(point, wall.endPoint) < HANDLE_WORLD)
      return { type: 'nonStructuralWallEnd', id: wall.id, point: wall.endPoint };
    const midX = (wall.startPoint.x + wall.endPoint.x) / 2;
    const midY = (wall.startPoint.y + wall.endPoint.y) / 2;
    if (distance(point, { x: midX, y: midY }) < HANDLE_WORLD)
      return { type: 'nonStructuralWallMid', id: wall.id, point: { x: midX, y: midY } };
    if (pointToSegmentDistance(point, wall.startPoint, wall.endPoint) < SEGMENT_WORLD)
      return { type: 'nonStructuralWall', id: wall.id, point: { x: midX, y: midY } };
  }
  return null;
}

export function hitTestPolylineNonStructuralWalls(point: Point2D, walls: PolylineNonStructuralWallElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const wall of filterHidden(walls, hiddenIds)) {
    for (let i = 0; i < wall.vertices.length; i++) {
      if (distance(point, wall.vertices[i]) < HANDLE_WORLD)
        return { type: 'polylineNonStructuralWallVertex', id: wall.id, point: wall.vertices[i], vertexIndex: i };
    }
    for (let i = 0; i < wall.vertices.length - 1; i++) {
      if (pointToSegmentDistance(point, wall.vertices[i], wall.vertices[i + 1]) < SEGMENT_WORLD)
        return { type: 'polylineNonStructuralWall', id: wall.id, point: { ...point } };
    }
  }
  return null;
}

export function hitTestBeams(point: Point2D, beams: BeamElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const beam of filterHidden(beams, hiddenIds)) {
    if (distance(point, beam.startPoint) < HANDLE_WORLD)
      return { type: 'beamStart', id: beam.id, point: beam.startPoint };
    if (distance(point, beam.endPoint) < HANDLE_WORLD)
      return { type: 'beamEnd', id: beam.id, point: beam.endPoint };
    const midX = (beam.startPoint.x + beam.endPoint.x) / 2;
    const midY = (beam.startPoint.y + beam.endPoint.y) / 2;
    if (distance(point, { x: midX, y: midY }) < HANDLE_WORLD)
      return { type: 'beamMid', id: beam.id, point: { x: midX, y: midY } };
    if (pointToSegmentDistance(point, beam.startPoint, beam.endPoint) < SEGMENT_WORLD)
      return { type: 'beam', id: beam.id, point: { x: midX, y: midY } };
  }
  return null;
}

function pointInAnyHole(point: Point2D, holes: Point2D[][]): boolean {
  for (const hole of holes) {
    if (hole.length >= 3 && pointInPolygon(point, hole)) return true;
  }
  return false;
}

export function hitTestSlab(point: Point2D, slab: SlabPolygon): HitResult | null {
  if (slab.vertices.length < 3) return null;

  for (let h = 0; h < slab.holes.length; h++) {
    const hole = slab.holes[h];
    if (hole.length < 3) continue;
    for (let i = 0; i < hole.length; i++) {
      if (distance(point, hole[i]) < SLAB_VERTEX_TOLERANCE) {
        return { type: 'slabHoleVertex', id: slab.id, point: { ...hole[i] }, holeIndex: h, vertexIndex: i };
      }
    }
    for (let i = 0; i < hole.length; i++) {
      const j = (i + 1) % hole.length;
      if (pointToSegmentDistance(point, hole[i], hole[j]) < SLAB_EDGE_TOLERANCE) {
        return { type: 'slabHoleEdge', id: slab.id, point: { ...point }, holeIndex: h, vertexIndex: i };
      }
    }
  }

  for (let h = 0; h < slab.holes.length; h++) {
    const hole = slab.holes[h];
    if (hole.length >= 3 && pointInPolygon(point, hole)) {
      return { type: 'slabHole', id: slab.id, point: { ...point }, holeIndex: h };
    }
  }

  for (let i = 0; i < slab.vertices.length; i++) {
    const j = (i + 1) % slab.vertices.length;
    if (pointToSegmentDistance(point, slab.vertices[i], slab.vertices[j]) < SLAB_EDGE_TOLERANCE) {
      if (distance(point, slab.vertices[i]) < SLAB_VERTEX_TOLERANCE) return { type: 'slabVertex', id: slab.id, point: { ...slab.vertices[i] }, vertexIndex: i };
      if (distance(point, slab.vertices[j]) < SLAB_VERTEX_TOLERANCE) return { type: 'slabVertex', id: slab.id, point: { ...slab.vertices[j] }, vertexIndex: j };
      return { type: 'slabEdge', id: slab.id, point: { ...point }, vertexIndex: i };
    }
  }
  for (let i = 0; i < slab.vertices.length; i++) {
    if (distance(point, slab.vertices[i]) < SLAB_VERTEX_TOLERANCE) {
      return { type: 'slabVertex', id: slab.id, point: { ...slab.vertices[i] }, vertexIndex: i };
    }
  }
  if (pointInPolygon(point, slab.vertices)) {
    return { type: 'slab', id: slab.id, point: { ...point } };
  }
  return null;
}

const DIM_HIT_WORLD = 0.15;

export function hitTestDimensions(point: Point2D, dimensions: Dimension[]): HitResult | null {
  for (const dim of dimensions) {
    const d = pointToSegmentDistance(point, dim.startPoint, dim.endPoint);
    if (d < DIM_HIT_WORLD) {
      return { type: 'none', id: dim.id, point: { ...point } };
    }
    if (distance(point, dim.startPoint) < DIM_HIT_WORLD * 2) {
      return { type: 'none', id: dim.id, point: { ...point } };
    }
    if (distance(point, dim.endPoint) < DIM_HIT_WORLD * 2) {
      return { type: 'none', id: dim.id, point: { ...point } };
    }
  }
  return null;
}

export function hitTestSlabs(point: Point2D, slabs: SlabPolygon[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const slab of filterHidden(slabs, hiddenIds)) {
    const hit = hitTestSlab(point, slab);
    if (hit) return hit;
  }
  return null;
}

export function hitTestDropPanel(point: Point2D, dp: DropPanelElement): HitResult | null {
  if (dp.vertices.length < 3) return null;
  for (let i = 0; i < dp.vertices.length; i++) {
    const j = (i + 1) % dp.vertices.length;
    if (pointToSegmentDistance(point, dp.vertices[i], dp.vertices[j]) < SLAB_EDGE_TOLERANCE) {
      if (distance(point, dp.vertices[i]) < SLAB_VERTEX_TOLERANCE) return { type: 'dropPanelVertex', id: dp.id, point: { ...dp.vertices[i] }, vertexIndex: i };
      if (distance(point, dp.vertices[j]) < SLAB_VERTEX_TOLERANCE) return { type: 'dropPanelVertex', id: dp.id, point: { ...dp.vertices[j] }, vertexIndex: j };
      return { type: 'dropPanelEdge', id: dp.id, point: { ...point }, vertexIndex: i };
    }
  }
  for (let i = 0; i < dp.vertices.length; i++) {
    if (distance(point, dp.vertices[i]) < SLAB_VERTEX_TOLERANCE) {
      return { type: 'dropPanelVertex', id: dp.id, point: { ...dp.vertices[i] }, vertexIndex: i };
    }
  }
  if (pointInPolygon(point, dp.vertices)) {
    return { type: 'dropPanel', id: dp.id, point: { ...point } };
  }
  return null;
}

export function hitTestDropPanels(point: Point2D, dropPanels: DropPanelElement[], hiddenIds: Set<string> = new Set()): HitResult | null {
  for (const dp of filterHidden(dropPanels, hiddenIds)) {
    const hit = hitTestDropPanel(point, dp);
    if (hit) return hit;
  }
  return null;
}