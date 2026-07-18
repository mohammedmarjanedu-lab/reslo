import { DxfWriter } from './dxfWriter';
import { computeGlobalMetrics } from '../engine/mathEngine';
import type { SlabPolygon, ColumnElement, ShearWallElement, PolylineWallElement, BeamElement, Dimension, DropPanelElement, NonStructuralWallElement, PolylineNonStructuralWallElement } from '../engine/types';

function colRect(col: ColumnElement): { x: number; y: number }[] {
  const hw = col.width / 2;
  const hd = col.depth / 2;
  const cosT = Math.cos(col.rotation);
  const sinT = Math.sin(col.rotation);
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return local.map(p => ({
    x: col.position.x + p.x * cosT - p.y * sinT,
    y: col.position.y + p.x * sinT + p.y * cosT,
  }));
}

function wallRect(start: { x: number; y: number }, end: { x: number; y: number }, thickness: number): { x: number; y: number }[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return [start, end];
  const ux = dx / len, uy = dy / len;
  const hw = thickness / 2;
  const px = -uy * hw, py = ux * hw;
  return [
    { x: start.x + px, y: start.y + py },
    { x: end.x + px, y: end.y + py },
    { x: end.x - px, y: end.y - py },
    { x: start.x - px, y: start.y - py },
  ];
}

export function exportDXF(
  slabs: SlabPolygon[],
  columns: ColumnElement[],
  walls: ShearWallElement[],
  polylineWalls: PolylineWallElement[],
  beams: BeamElement[],
  dropPanels: DropPanelElement[],
  nonStructuralWalls: NonStructuralWallElement[],
  polylineNonStructuralWalls: PolylineNonStructuralWallElement[],
  dimensions: Dimension[],
  pixelsPerMeter: number,
  isCalibrated: boolean,
  scaleLabel: string
): string {
  const dx = new DxfWriter();

  const metrics = computeGlobalMetrics(slabs, columns, walls, polylineWalls, beams, dropPanels, undefined, 0.25, nonStructuralWalls, polylineNonStructuralWalls);

  // Slabs
  for (const slab of slabs) {
    if (slab.vertices.length >= 3) {
      dx.lwpolyline(slab.vertices, true, 'SLABS');
      for (const hole of slab.holes) {
        if (hole.length >= 3) {
          dx.lwpolyline(hole, true, 'SLABS');
        }
      }
    }
  }

  // Columns
  for (const col of columns) {
    const pts = colRect(col);
    dx.lwpolyline(pts, true, 'COLUMNS');
  }

  // Walls
  for (const w of walls) {
    const pts = wallRect(w.startPoint, w.endPoint, w.thickness);
    dx.lwpolyline(pts, true, 'SHEAR-WALLS');
  }

  // Polyline walls
  for (const pw of polylineWalls) {
    for (let i = 0; i < pw.vertices.length - 1; i++) {
      const pts = wallRect(pw.vertices[i], pw.vertices[i + 1], pw.thickness);
      dx.lwpolyline(pts, true, 'POLYLINE-WALLS');
    }
  }

  // Beams
  for (const b of beams) {
    const pts = wallRect(b.startPoint, b.endPoint, b.depth);
    dx.lwpolyline(pts, true, 'BEAMS');
  }

  // Drop panels
  for (const dp of dropPanels) {
    if (dp.vertices.length >= 3) {
      dx.lwpolyline(dp.vertices, true, 'DROP-PANELS');
    }
  }

  // Dimensions
  for (const d of dimensions) {
    dx.line(d.startPoint, d.endPoint, 'DIMENSIONS');
  }

  // CM / CR markers
  dx.insert(metrics.cm.x, metrics.cm.y, 'CM-MARKER', 'CM-CR');
  dx.insert(metrics.cr.x, metrics.cr.y, 'CR-MARKER', 'CM-CR');

  // North arrow
  const bounds = computeContentBounds(slabs, columns, walls, polylineWalls, beams, dropPanels);
  const naX = bounds.minX - (bounds.maxX - bounds.minX) * 0.05;
  const naY = bounds.maxY + (bounds.maxY - bounds.minY) * 0.05;
  dx.insert(naX, naY, 'NORTH-ARROW', 'ANNOTATION');

  // Scale bar text
  const sbY = bounds.minY - (bounds.maxY - bounds.minY) * 0.08;
  const sbX = bounds.minX;
  if (isCalibrated) {
    const scaled = pixelsPerMeter > 0 ? `1:${Math.round(300 / (pixelsPerMeter * 0.0254))}` : '—';
    dx.text(sbX, sbY, `Scale: ${scaleLabel} (${scaled})`, 0.15, 'ANNOTATION');
  }
  dx.text(sbX, sbY - 0.25, `RESLO — Structural Layout`, 0.18, 'TITLE-BLOCK');
  dx.text(sbX, sbY - 0.45, `Project: RESLO | Date: ${new Date().toLocaleDateString()} | Sheet: 1/1`, 0.12, 'TITLE-BLOCK');

  return dx.toString();
}

function computeContentBounds(
  slabs: SlabPolygon[],
  columns: ColumnElement[],
  walls: ShearWallElement[],
  polylineWalls: PolylineWallElement[],
  beams: BeamElement[],
  dropPanels: DropPanelElement[] = []
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: { x: number; y: number }[] = [];
  for (const s of slabs) for (const v of s.vertices) pts.push(v);
  for (const c of columns) pts.push(c.position);
  for (const w of walls) { pts.push(w.startPoint); pts.push(w.endPoint); }
  for (const pw of polylineWalls) for (const v of pw.vertices) pts.push(v);
  for (const b of beams) { pts.push(b.startPoint); pts.push(b.endPoint); }
  for (const dp of dropPanels) for (const v of dp.vertices) pts.push(v);
  if (pts.length === 0) return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = Math.max((maxX - minX) * 0.1, 1);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}
