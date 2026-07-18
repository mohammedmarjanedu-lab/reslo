import type { Point2D } from './types';

export const STANDARD_SCALES = [
  { label: '1:50',   ratio: 50   },
  { label: '1:100',  ratio: 100  },
  { label: '1:200',  ratio: 200  },
  { label: '1:250',  ratio: 250  },
  { label: '1:500',  ratio: 500  },
  { label: '1:1000', ratio: 1000 },
] as const;

export type StandardScale = typeof STANDARD_SCALES[number];

const DEFAULT_SCREEN_DPI = 96;

export function pixelsPerMeterToScaleRatio(ppm: number, screenDPI: number = DEFAULT_SCREEN_DPI): number {
  return Math.round(ppm * 0.0254 / screenDPI * 1000) / 1000;
}

export function computeScaleLabel(ppm: number): string {
  if (ppm < 0.001) return '—';
  const ratio = pixelsPerMeterToScaleRatio(ppm);
  const nearest = [50, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000].reduce((a, b) =>
    Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a
  );
  const diff = Math.abs(ratio - nearest);
  if (diff / nearest < 0.15) return `≈ 1:${nearest}`;
  return `1:${ratio.toFixed(1)}`;
}

export class ScaleCalibrator {
  private _pixelsPerMeter: number = 100;

  setFromScale(scaleRatio: number, screenDPI: number = DEFAULT_SCREEN_DPI): void {
    this._pixelsPerMeter = screenDPI / (0.0254 * scaleRatio);
  }

  setFromTwoPoints(p1: Point2D, p2: Point2D, actualLengthMeters: number, canvasZoom: number = 1): void {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const minPixels = Math.max(5, 20 / canvasZoom);
    if (pixelDistance < minPixels) throw new Error('Calibration points too close together — zoom in and try again');
    if (actualLengthMeters <= 0) throw new Error('Actual length must be positive');
    this._pixelsPerMeter = pixelDistance / (actualLengthMeters * canvasZoom);
  }

  get pixelsPerMeter(): number { return this._pixelsPerMeter; }
  set pixelsPerMeter(val: number) { this._pixelsPerMeter = val; }

  toWorld(canvasPx: number): number { return canvasPx / this._pixelsPerMeter; }
  toCanvas(worldM: number): number { return worldM * this._pixelsPerMeter; }

  toWorldPoint(p: Point2D): Point2D {
    return { x: p.x / this._pixelsPerMeter, y: p.y / this._pixelsPerMeter };
  }

  toCanvasPoint(p: Point2D): Point2D {
    return { x: p.x * this._pixelsPerMeter, y: p.y * this._pixelsPerMeter };
  }
}
