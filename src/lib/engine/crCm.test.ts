import { describe, it, expect } from 'vitest';
import { computeGlobalMetrics, computeShearWallStiffness } from './mathEngine';
import type { SlabPolygon, ShearWallElement, ColumnElement, BeamElement } from './types';

describe('CR and CM computation', () => {

  function slab(id: string, x0: number, y0: number, w: number, h: number, t = 0.2, load = 5): SlabPolygon {
    return {
      id,
      label: id,
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ],
      holes: [],
      thickness: t,
      uniformLoad: load,
      partitionLoad: 0,
      concreteDensity: 25,
      elasticModulus: 25e6,
    };
  }

  function hWall(id: string, x0: number, y: number, len: number, t = 0.3, H = 3.0): ShearWallElement {
    return {
      id, label: 'Wall',
      startPoint: { x: x0, y },
      endPoint: { x: x0 + len, y },
      thickness: t, height: H,
      elasticModulus: 25e6,
      concreteDensity: 25,
      shearModulus: 0,
    };
  }

  function vWall(id: string, x: number, y0: number, len: number, t = 0.3, H = 3.0): ShearWallElement {
    return {
      id, label: 'Wall',
      startPoint: { x, y: y0 },
      endPoint: { x, y: y0 + len },
      thickness: t, height: H,
      elasticModulus: 25e6,
      concreteDensity: 25,
      shearModulus: 0,
    };
  }

  function col(id: string, x: number, y: number, w = 0.4, d = 0.4, H = 3.0): ColumnElement {
    return {
      id, label: 'Column',
      position: { x, y },
      width: w, depth: d, height: H,
      rotation: 0,
      elasticModulus: 25e6,
      concreteDensity: 25,
      boundaryCondition: 'fixed-fixed',
    };
  }

  it('symmetric building: CR = CM at center', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const walls: ShearWallElement[] = [
      hWall('w1', 0, 0, 10),
      hWall('w2', 0, 8, 10),
      vWall('w3', 0, 0, 8),
      vWall('w4', 10, 0, 8),
    ];
    const result = computeGlobalMetrics([s], [], walls);
    expect(result.cm.x).toBeCloseTo(5.0, 1);
    expect(result.cm.y).toBeCloseTo(4.0, 1);
    expect(result.cr.x).toBeCloseTo(5.0, 1);
    expect(result.cr.y).toBeCloseTo(4.0, 1);
    expect(result.ex).toBeLessThan(0.1);
    expect(result.ey).toBeLessThan(0.1);
  });

  it('asymmetric only-left-wall shifts CR left', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const walls: ShearWallElement[] = [
      vWall('wL', 0, 0, 8),
    ];
    const result = computeGlobalMetrics([s], [], walls);
    // Only left wall at x=0 → XCR = 0 * ky / ky = 0
    // YCR = 4 * kx / kx = 4 (wall midpoint)
    expect(result.cr.x).toBeCloseTo(0, 1);
    expect(result.cr.y).toBeCloseTo(4, 1);
  });

  it('asymmetric walls produce CR offset from CM', () => {
    const s = slab('s1', 0, 0, 12, 8);
    const walls: ShearWallElement[] = [
      vWall('wL', 0, 0, 8),
      vWall('wR', 12, 0, 8),
      hWall('wB', 0, 0, 12),
    ];
    const result = computeGlobalMetrics([s], [], walls);
    // Horizontal wall has large kx (in-plane along X) at y=0
    // Vertical walls have small kx (out-of-plane) at y=4
    // YCR pulls toward y=0 because horizontal wall dominates kx
    // XCR = Σ(x·ky)/Σ(ky): vertical walls dominate ky → avg x=(0+12)/2=6
    const kB = computeShearWallStiffness(walls[2]);
    const kL = computeShearWallStiffness(walls[0]);
    const kR = computeShearWallStiffness(walls[1]);
    const expectedYcr = (0*kB.kx + 4*kL.kx + 4*kR.kx) / (kB.kx + kL.kx + kR.kx);
    expect(result.cr.x).toBeCloseTo(6.0, 1);
    expect(result.cr.y).toBeCloseTo(expectedYcr, 4);
  });

  it('single corner wall pulls CR to corner', () => {
    const s = slab('s1', 0, 0, 12, 8);
    const walls: ShearWallElement[] = [
      hWall('wB', 0, 0, 6),
      vWall('wL', 0, 0, 4),
    ];
    const result = computeGlobalMetrics([s], [], walls);
    expect(result.cr.x).toBeGreaterThan(0);
    expect(result.cr.y).toBeGreaterThan(0);
    expect(result.cr.x).toBeLessThan(6);
    expect(result.cr.y).toBeLessThan(4);
    // CM is geometric centroid of slab only
    expect(result.cm.x).toBeCloseTo(6.0, 1);
    expect(result.cm.y).toBeCloseTo(4.0, 1);
  });

  it('CM is geometric centroid regardless of column position', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const columns: ColumnElement[] = [
      col('c1', 8, 6),
    ];
    const result = computeGlobalMetrics([s], columns, []);
    // CM = slab geometric centroid, column weight not considered
    expect(result.cm.x).toBeCloseTo(5.0, 1);
    expect(result.cm.y).toBeCloseTo(4.0, 1);
  });

  it('no walls: CR falls back to CM', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const result = computeGlobalMetrics([s], [], []);
    expect(result.cm.x).toBeCloseTo(5.0, 1);
    expect(result.cm.y).toBeCloseTo(4.0, 1);
    expect(result.cr.x).toBeCloseTo(result.cm.x, 3);
    expect(result.cr.y).toBeCloseTo(result.cm.y, 3);
    expect(result.ex).toBeCloseTo(0, 3);
    expect(result.ey).toBeCloseTo(0, 3);
  });

  it('reports torsional eccentricity', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const walls: ShearWallElement[] = [
      hWall('wB', 0, 0, 10),
    ];
    const result = computeGlobalMetrics([s], [], walls);
    expect(result.ex).toBeGreaterThanOrEqual(0);
    expect(result.ey).toBeGreaterThanOrEqual(0);
    expect(typeof result.hasTorsionalIrregularity).toBe('boolean');
    expect(typeof result.hasExtremeTorsionalIrregularity).toBe('boolean');
  });

  it('CM is geometric centroid of slab regardless of beam position', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const beams: BeamElement[] = [
      {
        id: 'b1', label: 'Beam',
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 10, y: 0 },
        width: 0.3, depth: 0.5, height: 0.5,
        concreteDensity: 25,
        elasticModulus: 25e6,
      },
    ];
    const result = computeGlobalMetrics([s], [], [], [], beams);
    expect(result.cm.x).toBeCloseTo(5.0, 1);
    expect(result.cm.y).toBeCloseTo(4.0, 1);
  });

  it('backend CR overrides static CR', () => {
    const s = slab('s1', 0, 0, 10, 8);
    const walls: ShearWallElement[] = [
      hWall('wB', 0, 0, 10),
    ];
    const backendCR = { x: 3.0, y: 2.0 };
    const result = computeGlobalMetrics([s], [], walls, [], [], [], backendCR);
    expect(result.cr.x).toBe(3.0);
    expect(result.cr.y).toBe(2.0);
  });
});
