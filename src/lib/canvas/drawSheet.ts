import type { Point2D, SlabPolygon, ColumnElement, ShearWallElement, PolylineWallElement, BeamElement, DropPanelElement, NonStructuralWallElement, PolylineNonStructuralWallElement } from '../engine/types';
import { drawSlabs, drawColumn, drawShearWall, drawPolylineWall, drawNonStructuralWall, drawNonStructuralPolylineWall, drawBeam, drawDropPanel, drawCMmarker, drawCRmarker, drawEccentricityVector } from './renderer';
import { computeGlobalMetrics } from '../engine/mathEngine';
import { LOGO_BASE64 } from './logo';

const logoImage = new Image();
logoImage.src = `data:image/png;base64,${LOGO_BASE64}`;

const SHEET_DPI = 300;
const SHEET_W = Math.round(11.69 * SHEET_DPI); // 3507 px
const SHEET_H = Math.round(8.27 * SHEET_DPI); // 2481 px

const CAD_BG = '#F5F0E8';
const CAD_BORDER = '#8B7355';
const CAD_GRID = '#D4C9B8';
const CAD_TEXT = '#3D3520';
const CAD_MUTED = '#6B5E3A';
const CAD_RED = '#C0392B';

const ACCENT_COLUMN = '#00e5ff';
const ACCENT_BEAM = '#10b981';
const ACCENT_WALL = '#a78bfa';
const ACCENT_SLAB = '#ff4d79';
const ACCENT_DROPPANEL = '#f97316';

function mm(v: number): number {
  return Math.round((v / 25.4) * SHEET_DPI);
}

const MARGIN = mm(12);
const BORDER_GAP = mm(4);
const HEADER_H = mm(10);
const LEGEND_H = mm(7);

function formatDateShort(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

function computeContentBounds(
  slabs: SlabPolygon[],
  columns: ColumnElement[],
  walls: ShearWallElement[],
  polylineWalls: PolylineWallElement[],
  nonStructuralWalls: NonStructuralWallElement[],
  polylineNonStructuralWalls: PolylineNonStructuralWallElement[],
  beams: BeamElement[],
  dropPanels: DropPanelElement[],
  planImage: ImageBitmap | null,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  ppm: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: Point2D[] = [];
  for (const s of slabs) for (const v of s.vertices) pts.push(v);
  for (const c of columns) pts.push(c.position);
  for (const w of walls) { pts.push(w.startPoint); pts.push(w.endPoint); }
  for (const pw of polylineWalls) for (const v of pw.vertices) pts.push(v);
  for (const w of nonStructuralWalls) { pts.push(w.startPoint); pts.push(w.endPoint); }
  for (const pw of polylineNonStructuralWalls) for (const v of pw.vertices) pts.push(v);
  for (const b of beams) { pts.push(b.startPoint); pts.push(b.endPoint); }
  for (const dp of dropPanels) for (const v of dp.vertices) pts.push(v);
  if (planImage && ppm > 0.001) {
    pts.push({ x: 0, y: 0 });
    pts.push({ x: imageNaturalWidth / ppm, y: imageNaturalHeight / ppm });
  }
  if (pts.length === 0) return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = Math.max((maxX - minX) * 0.05, 0.5);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function renderPlanClean(
  slabs: SlabPolygon[],
  columns: ColumnElement[],
  walls: ShearWallElement[],
  polylineWalls: PolylineWallElement[],
  nonStructuralWalls: NonStructuralWallElement[],
  polylineNonStructuralWalls: PolylineNonStructuralWallElement[],
  beams: BeamElement[],
  dropPanels: DropPanelElement[],
  planImage: ImageBitmap | null,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  ppm: number
): { canvas: HTMLCanvasElement; bounds: { minX: number; minY: number; maxX: number; maxY: number }; metrics: ReturnType<typeof computeGlobalMetrics> } {
  const bounds = computeContentBounds(slabs, columns, walls, polylineWalls, nonStructuralWalls, polylineNonStructuralWalls, beams, dropPanels, planImage, imageNaturalWidth, imageNaturalHeight, ppm);
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;

  const exportPPM = ppm * (SHEET_DPI / 96);

  const pxW = Math.ceil(worldW * exportPPM);
  const pxH = Math.ceil(worldH * exportPPM);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(pxW, 100);
  canvas.height = Math.max(pxH, 100);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ox = -bounds.minX * exportPPM;
  const oy = -bounds.minY * exportPPM;
  ctx.setTransform(exportPPM, 0, 0, exportPPM, ox, oy);

  if (planImage) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.drawImage(planImage, 0, 0, imageNaturalWidth / ppm, imageNaturalHeight / ppm);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.setTransform(exportPPM, 0, 0, exportPPM, ox, oy);

  if (slabs.length > 0) drawSlabs(ctx, slabs, []);
  for (const w of walls) {
    drawShearWall(ctx, w);
  }
  for (const pw of polylineWalls) {
    drawPolylineWall(ctx, pw);
  }
  for (const w of nonStructuralWalls) {
    drawNonStructuralWall(ctx, w);
  }
  for (const pw of polylineNonStructuralWalls) {
    drawNonStructuralPolylineWall(ctx, pw);
  }
  for (const b of beams) drawBeam(ctx, b);
  for (const c of columns) drawColumn(ctx, c);
  for (const dp of dropPanels) drawDropPanel(ctx, dp);

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const metrics = computeGlobalMetrics(slabs, columns, walls, polylineWalls, beams, dropPanels, undefined, 0.25, nonStructuralWalls, polylineNonStructuralWalls);
  const cmSx = metrics.cm.x * exportPPM + ox;
  const cmSy = metrics.cm.y * exportPPM + oy;
  const crSx = metrics.cr.x * exportPPM + ox;
  const crSy = metrics.cr.y * exportPPM + oy;
  drawCMmarker(ctx, cmSx, cmSy);
  drawCRmarker(ctx, crSx, crSy);
  drawEccentricityVector(ctx, cmSx, cmSy, crSx, crSy, metrics.ex, metrics.ey);

  return { canvas, bounds, metrics };
}

function drawHeaderBar(ctx: CanvasRenderingContext2D, totalElements: number, calibrated: boolean): void {
  const ib = MARGIN + BORDER_GAP;
  const hx = ib;
  const hy = ib;
  const hw = SHEET_W - 2 * ib;
  const hh = HEADER_H;

  ctx.save();
  const grad = ctx.createLinearGradient(hx, hy, hx, hy + hh);
  grad.addColorStop(0, '#f8f9fc');
  grad.addColorStop(1, '#f0f2f7');
  ctx.fillStyle = grad;
  ctx.fillRect(hx, hy, hw, hh);

  ctx.strokeStyle = '#d0d5dd';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(hx, hy, hw, hh);

  ctx.font = `700 ${mm(3.2)}px "Space Grotesk", "Inter", sans-serif`;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('RESLO', hx + mm(3), hy + hh / 2);

  ctx.font = `500 ${mm(3)}px "Space Grotesk", "Inter", sans-serif`;
  ctx.fillStyle = '#6366f1';
  ctx.fillText('CONCEPT STRUCTURAL LAYOUT', hx + mm(16), hy + hh / 2);

  ctx.beginPath();
  ctx.arc(hx + hw - mm(50), hy + hh / 2 - mm(1), mm(1.5), 0, Math.PI * 2);
  ctx.fillStyle = calibrated ? '#10b981' : '#f59e0b';
  ctx.fill();

  ctx.font = `500 ${mm(2.2)}px "Space Grotesk", "Inter", sans-serif`;
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${totalElements} elements`, hx + hw - mm(3), hy + hh / 2 - mm(3));
  ctx.fillText(calibrated ? 'Calibrated' : 'Not calibrated', hx + hw - mm(3), hy + hh / 2 + mm(2.5));

  const sep = hx + hw - mm(55);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(sep, hy + mm(2));
  ctx.lineTo(sep, hy + hh - mm(2));
  ctx.stroke();

  ctx.restore();
}

function drawPlanBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.10)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, w, h);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.3;
  ctx.strokeRect(x + mm(1), y + mm(1), w - mm(2), h - mm(2));
  ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D, counts: Record<string, number>): void {
  const ib = MARGIN + BORDER_GAP;
  const lx = ib + mm(3);
  const ly = ib + HEADER_H + mm(4);
  const lw = SHEET_W - 2 * ib - mm(6);
  const lh = LEGEND_H;

  const items = [
    { label: 'Columns', count: counts.columns, color: ACCENT_COLUMN },
    { label: 'Beams', count: counts.beams, color: ACCENT_BEAM },
    { label: 'Walls', count: counts.walls, color: ACCENT_WALL },
    { label: 'Partitions', count: counts.partitions ?? 0, color: '#f97316' },
    { label: 'Slabs', count: counts.slabs, color: ACCENT_SLAB },
    { label: 'Drop Panels', count: counts.dropPanels, color: ACCENT_DROPPANEL },
  ];

  ctx.save();
  ctx.font = `600 ${mm(2.2)}px "Space Grotesk", "Inter", sans-serif`;

  const totalW = lw;
  const gap = mm(4);
  const itemW = (totalW - gap * (items.length - 1)) / items.length;

  for (let i = 0; i < items.length; i++) {
    const ix = lx + i * (itemW + gap);
    const iy = ly;

    ctx.fillStyle = items[i].color;
    ctx.beginPath();
    ctx.roundRect(ix, iy, mm(2.5), mm(2.5), 0.5);
    ctx.fill();

    ctx.fillStyle = '#374151';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(items[i].label, ix + mm(4), iy + mm(1.2));

    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'left';
    ctx.fillText(String(items[i].count), ix + mm(4), iy + mm(4.5));
  }
  ctx.restore();
}

function drawScaleBar(ctx: CanvasRenderingContext2D, calibrated: boolean, ppm: number): void {
  const ib = MARGIN + BORDER_GAP;
  const cadH = mm(38);
  const sx = ib + mm(3);
  const sy = SHEET_H - ib - cadH - mm(8);

  const scaleLabel = calibrated ? `1:${Math.round(ppm * 0.0254)}` : 'NTS';

  ctx.save();
  ctx.font = `600 ${mm(2.2)}px "Space Grotesk", "Inter", sans-serif`;
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCALE', sx, sy);

  ctx.font = `600 ${mm(2.8)}px "JetBrains Mono", "Consolas", monospace`;
  ctx.fillStyle = '#111827';
  ctx.fillText(scaleLabel, sx + mm(12), sy);

  if (calibrated) {
    const barLen = mm(20);
    const barY = sy + mm(3);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx, barY);
    ctx.lineTo(sx + barLen, barY);
    ctx.stroke();
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, barY - mm(1.5));
    ctx.lineTo(sx, barY + mm(1.5));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + barLen, barY - mm(1.5));
    ctx.lineTo(sx + barLen, barY + mm(1.5));
    ctx.stroke();
    ctx.font = `500 ${mm(2)}px "Space Grotesk", "Inter", sans-serif`;
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`${(barLen / ppm / (SHEET_DPI / 96) / 2).toFixed(1)}m`, sx + barLen / 2, barY + mm(3));
    ctx.fillText('0', sx - mm(1), barY + mm(3));
  }
  ctx.restore();
}

function drawNorthArrow(ctx: CanvasRenderingContext2D): void {
  const ib = MARGIN + BORDER_GAP;
  const cadH = mm(38);
  const nx = ib + mm(45);
  const ny = SHEET_H - ib - cadH - mm(4);
  const s = mm(3);

  ctx.save();
  ctx.fillStyle = '#374151';
  ctx.beginPath();
  ctx.moveTo(nx, ny - s * 1.5);
  ctx.lineTo(nx - s * 0.6, ny + s * 0.8);
  ctx.lineTo(nx - s * 0.2, ny + s * 0.4);
  ctx.lineTo(nx, ny + s);
  ctx.lineTo(nx + s * 0.2, ny + s * 0.4);
  ctx.lineTo(nx + s * 0.6, ny + s * 0.8);
  ctx.closePath();
  ctx.fill();

  ctx.font = `600 ${mm(2)}px "Space Grotesk", "Inter", sans-serif`;
  ctx.fillStyle = '#374151';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', nx, ny - s * 1.6);
  ctx.restore();
}

// Draw the beautifully aligned blueprint title block in the bottom-right corner
function drawCADTitleBlock(ctx: CanvasRenderingContext2D, calibrated: boolean, ppm: number): void {
  const ib = MARGIN + BORDER_GAP;
  const availableW = SHEET_W - 2 * ib;
  
  // Set explicit width and height
  const w = Math.round(availableW * 0.55); // ~1720 px
  const h = mm(38); // ~448 px
  const tx = SHEET_W - ib - w - mm(2);
  const ty = SHEET_H - ib - h - mm(2);

  ctx.save();
  
  // Draw block background
  ctx.fillStyle = CAD_BG;
  ctx.fillRect(tx, ty, w, h);
  
  // Outer Border line
  ctx.strokeStyle = CAD_BORDER;
  ctx.lineWidth = 1.0;
  ctx.strokeRect(tx, ty, w, h);

  const thin = () => { ctx.strokeStyle = CAD_GRID; ctx.lineWidth = 0.5; };
  const med = () => { ctx.strokeStyle = CAD_BORDER; ctx.lineWidth = 0.8; };

  const fLabel = (s: number) => `700 ${mm(s)}px "Space Grotesk", "Inter", sans-serif`;
  const fValue = (s: number) => `600 ${mm(s)}px "Space Grotesk", "Inter", sans-serif`;
  const fMono = (s: number) => `500 ${mm(s)}px "JetBrains Mono", "Consolas", monospace`;

  function cell(x: number, y: number, label: string, value: string, vc = CAD_TEXT, ls = 2, vs = 2.6) {
    ctx.font = fLabel(ls);
    ctx.fillStyle = CAD_MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x + mm(1.5), y + mm(3.2));
    ctx.font = fValue(vs);
    ctx.fillStyle = vc;
    ctx.textBaseline = 'top';
    ctx.fillText(value, x + mm(1.5), y + mm(3.4));
  }

  const vLn = (x: number, y1: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke(); };
  const hLn = (y: number, x1: number, x2: number) => { ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); };

  // Calculate layout grid divisions
  const colLogoW = mm(12);
  const colInfoW = Math.round(w * 0.25);
  const colParamW = Math.round(w * 0.15);
  const colCostW = w - colLogoW - colInfoW - colParamW;

  const row1H = mm(8);
  const row1Y = ty + row1H;

  // Draw Row 1 - Main Headers
  med();
  hLn(row1Y, tx, tx + w);
  thin();

  // Concept Designs brand
  ctx.font = fLabel(2.6);
  ctx.fillStyle = CAD_TEXT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('CONCEPT DESIGNS', tx + mm(2.5), ty + row1H / 2);

  // DATE
  const dateX = tx + w * 0.20;
  vLn(dateX, ty, row1Y);
  cell(dateX, ty, 'DATE', formatDateShort(), CAD_TEXT);

  // SCALE
  const scaleX = tx + w * 0.35;
  vLn(scaleX, ty, row1Y);
  cell(scaleX, ty, 'SCALE', calibrated ? `1:${Math.round(ppm * 0.0254)}` : 'NTS', CAD_TEXT);

  // COLUMN COST: 1 COL header spanning over Costs
  const costHeaderX = tx + w * 0.52;
  vLn(costHeaderX, ty, row1Y);
  cell(costHeaderX, ty, 'COLUMN COST', '1 COL', CAD_TEXT);

  // PRINT utility
  ctx.font = fLabel(2);
  ctx.fillStyle = CAD_MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRINT', tx + w - mm(3), ty + row1H / 2);

  // Row 2 - Body Elements (divided into 3 rows horizontally)
  const bodyH = h - row1H;
  const bodyRowH = bodyH / 3;

  const logoX = tx;
  const infoX = logoX + colLogoW;
  const paramX = infoX + colInfoW;
  const costX = paramX + colParamW;

  thin();
  vLn(infoX, row1Y, ty + h);
  vLn(paramX, row1Y, ty + h);
  vLn(costX, row1Y, ty + h);

  // Draw horizontal dividers for Column 2 and Column 3 only
  for (let i = 1; i <= 2; i++) {
    med();
    hLn(ty + row1H + i * bodyRowH, infoX, paramX + colParamW);
  }

  // Draw Logo emblem in red on the left
  if (logoImage.complete && logoImage.naturalWidth > 0) {
    const lw = mm(9);
    const lh = (lw / logoImage.naturalWidth) * logoImage.naturalHeight;
    ctx.drawImage(logoImage, logoX + (colLogoW - lw) / 2, ty + row1H + (bodyH - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = CAD_RED;
    ctx.font = `bold ${mm(5)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('9e', logoX + colLogoW / 2, ty + row1H + bodyH / 2);
  }

  // Info Column details
  const infoData = [
    { label: 'PROJECT', value: 'RESLO — Structural Layout' },
    { label: 'DRAWING TITLE', value: 'Structural Framing Plan' },
    { label: 'COLUMN OPTIONS', value: 'RCC / STEEL / CFT' },
  ];
  for (let i = 0; i < infoData.length; i++) {
    cell(infoX, ty + row1H + i * bodyRowH, infoData[i].label, infoData[i].value, CAD_TEXT, 2, 2.4);
  }

  // Parameter Column cells
  const paramData = [
    { label: 'GRID SIZE', value: '9m x 9m' },
    { label: 'STOREYS', value: '10' },
    { label: 'STOREY HT.', value: '4m' },
  ];
  for (let i = 0; i < paramData.length; i++) {
    cell(paramX, ty + row1H + i * bodyRowH, paramData[i].label, paramData[i].value, CAD_TEXT, 2, 2.4);
  }

  // Cost Column cells - beautifully formatted exactly like the reference PDF
  const costLabelW = colCostW / 3;
  const costBreakdowns = [
    { label: 'RCC', total: 'Rs 15.14L', per: 'Rs 1.51L / STOREY', mat: '1 col material: Conc 24.2...' },
    { label: 'STEEL', total: 'Rs 77.53L', per: 'Rs 7.75L / STOREY', mat: '1 col material: Conc 0.0...' },
    { label: 'CFT', total: 'Rs 53.58L', per: 'Rs 5.36L / STOREY', mat: '1 col material: Conc 10.2...' }
  ];

  for (let j = 0; j < costBreakdowns.length; j++) {
    const cx = costX + j * costLabelW;
    if (j > 0) {
      thin();
      vLn(cx, row1Y, ty + h);
    }
    
    // Draw text inside column with clean padding and no horizontal dividers
    const paddingX = mm(1.5);
    const startY = row1Y + mm(1.5);
    
    // Line 1: Label (left) and Total (right)
    ctx.font = fLabel(2);
    ctx.fillStyle = CAD_MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(costBreakdowns[j].label, cx + paddingX, startY);

    ctx.font = fMono(2.5);
    ctx.fillStyle = CAD_RED;
    ctx.textAlign = 'right';
    ctx.fillText(costBreakdowns[j].total, cx + costLabelW - paddingX, startY);

    // Line 2: Per storey cost
    const line2Y = startY + mm(3.4);
    ctx.font = fValue(2.2);
    ctx.fillStyle = CAD_RED;
    ctx.textAlign = 'left';
    ctx.fillText(costBreakdowns[j].per, cx + paddingX, line2Y);

    // Line 3: Material description
    const line3Y = line2Y + mm(3.4);
    ctx.font = fMono(1.6);
    ctx.fillStyle = CAD_MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(costBreakdowns[j].mat, cx + paddingX, line3Y);
  }

  // Revision row at the very bottom
  med();
  const revY = ty + h - mm(5);
  hLn(revY, tx, tx + w);
  const revCols = ['REV', 'DESCRIPTION', 'DATE', 'APPROVED'];
  const revColW = [mm(8), Math.round(w * 0.35), mm(18), mm(18)];
  let revX = tx;
  for (let i = 0; i < revCols.length; i++) {
    if (i > 0) { thin(); vLn(revX, revY, ty + h); }
    ctx.font = fLabel(1.8);
    ctx.fillStyle = CAD_MUTED;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(revCols[i], revX + revColW[i] / 2, revY + mm(2.5));
    revX += revColW[i];
  }

  ctx.font = fValue(2);
  ctx.fillStyle = CAD_MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHEET 1 / 1', tx + w - mm(3), revY + mm(2.5));
  ctx.restore();
}

// Generate the fully restructured drawing export sheet
export function exportDrawingSheet(
  slabs: SlabPolygon[],
  columns: ColumnElement[],
  walls: ShearWallElement[],
  polylineWalls: PolylineWallElement[],
  nonStructuralWalls: NonStructuralWallElement[],
  polylineNonStructuralWalls: PolylineNonStructuralWallElement[],
  beams: BeamElement[],
  dropPanels: DropPanelElement[],
  planImage: ImageBitmap | null,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  isCalibrated: boolean,
  pixelsPerMeter: number
): HTMLCanvasElement {
  const { canvas: planCanvas, bounds, metrics } = renderPlanClean(slabs, columns, walls, polylineWalls, nonStructuralWalls, polylineNonStructuralWalls, beams, dropPanels, planImage, imageNaturalWidth, imageNaturalHeight, pixelsPerMeter);

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = SHEET_W;
  sheetCanvas.height = SHEET_H;
  const ctx = sheetCanvas.getContext('2d')!;

  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 0.4;
  ctx.strokeRect(MARGIN, MARGIN, SHEET_W - 2 * MARGIN, SHEET_H - 2 * MARGIN);
  ctx.restore();

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  const ib = MARGIN + BORDER_GAP;
  ctx.strokeRect(ib, ib, SHEET_W - 2 * ib, SHEET_H - 2 * ib);

  const structWalls = walls;
  const partWalls = nonStructuralWalls;
  const structPW = polylineWalls;
  const partPW = polylineNonStructuralWalls;
  const totalElements = slabs.length + columns.length + structWalls.length + structPW.length + beams.length + dropPanels.length;
  drawHeaderBar(ctx, totalElements, isCalibrated);

  drawLegend(ctx, {
    columns: columns.length,
    beams: beams.length,
    walls: structWalls.length + structPW.length,
    partitions: partWalls.length + partPW.length,
    slabs: slabs.length,
    dropPanels: dropPanels.length,
  });

  const cadH = mm(38);
  const planTopY = ib + HEADER_H + LEGEND_H + mm(4);
  const planBotY = SHEET_H - ib - cadH - mm(4);
  const planX = ib + mm(3);
  const planW = SHEET_W - 2 * ib - mm(6);
  const planH = planBotY - planTopY;

  const srcW = planCanvas.width;
  const srcH = planCanvas.height;
  let fitScale = Math.min(planW / srcW, planH / srcH);
  const dstW = srcW * fitScale;
  const dstH = srcH * fitScale;
  const dstX = planX + (planW - dstW) / 2;
  const dstY = planTopY + (planH - dstH) / 2;

  drawPlanBorder(ctx, dstX - mm(2), dstY - mm(2), dstW + mm(4), dstH + mm(4));

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.drawImage(planCanvas, dstX, dstY, dstW, dstH);
  ctx.restore();

  drawScaleBar(ctx, isCalibrated, pixelsPerMeter);
  drawNorthArrow(ctx);
  drawCADTitleBlock(ctx, isCalibrated, pixelsPerMeter);

  return sheetCanvas;
}
