type DxfValue = string | number;

function esc(s: string): string {
  return s.replace(/\n/g, '\\P').replace(/\r/g, '');
}

function pair(code: number, value: DxfValue): string {
  return `${code}\n${typeof value === 'number' ? value : esc(String(value))}\n`;
}

export class DxfWriter {
  private lines: string[] = [];
  private handles = 0;

  nextHandle(): string {
    this.handles++;
    return this.handles.toString(16).toUpperCase();
  }

  write(code: number, value: DxfValue): void {
    this.lines.push(`${code}\n${typeof value === 'number' ? String(value) : esc(String(value))}`);
  }

  section(name: string): void {
    this.write(0, 'SECTION');
    this.write(2, name);
  }

  endSection(): void {
    this.write(0, 'ENDSEC');
  }

  private header(): void {
    this.section('HEADER');
    this.write(9, '$ACADVER');
    this.write(1, 'AC1015');
    this.write(9, '$INSUNITS');
    this.write(70, 6); // 6 = meters
    this.write(9, '$EXTMIN');
    this.write(10, -1000);
    this.write(20, -1000);
    this.write(9, '$EXTMAX');
    this.write(10, 1000);
    this.write(20, 1000);
    this.write(9, '$LUPREC');
    this.write(70, 3);
    this.write(9, '$LUNITS');
    this.write(70, 2); // decimal
    this.endSection();
  }

  private tables(): void {
    this.section('TABLES');

    // Layer table
    this.write(0, 'TABLE');
    this.write(2, 'LAYER');
    const handle = this.nextHandle();
    this.write(5, handle);
    this.write(100, 'AcDbSymbolTable');
    this.write(70, 12);

    const layers = [
      { name: '0', color: 7, lineType: 'CONTINUOUS' },
      { name: 'SLABS', color: 4, lineType: 'CONTINUOUS' },
      { name: 'COLUMNS', color: 5, lineType: 'CONTINUOUS' },
      { name: 'SHEAR-WALLS', color: 1, lineType: 'CONTINUOUS' },
      { name: 'POLYLINE-WALLS', color: 1, lineType: 'CONTINUOUS' },
      { name: 'BEAMS', color: 6, lineType: 'CONTINUOUS' },
      { name: 'DIMENSIONS', color: 3, lineType: 'CONTINUOUS' },
      { name: 'CM-CR', color: 2, lineType: 'DASHED' },
      { name: 'TITLE-BLOCK', color: 7, lineType: 'CONTINUOUS' },
      { name: 'TEXT', color: 7, lineType: 'CONTINUOUS' },
      { name: 'GRID', color: 8, lineType: 'DASHDOT' },
      { name: 'ANNOTATION', color: 3, lineType: 'CONTINUOUS' },
    ];

    for (const lay of layers) {
      const h = this.nextHandle();
      this.write(0, 'LAYER');
      this.write(5, h);
      this.write(100, 'AcDbSymbolTableRecord');
      this.write(100, 'AcDbLayerTableRecord');
      this.write(2, lay.name);
      this.write(70, 0);
      this.write(62, lay.color);
      this.write(6, lay.lineType);
      this.write(370, -3);
    }

    this.write(0, 'ENDTAB');
    this.endSection();
  }

  entity(name: string): void {
    this.write(0, name);
  }

  layer(name: string): void {
    this.write(8, name);
  }

  color(c: number): void {
    this.write(62, c);
  }

  line(p1: { x: number; y: number }, p2: { x: number; y: number }, layerName: string): void {
    this.entity('LINE');
    this.layer(layerName);
    this.write(10, p1.x);
    this.write(20, p1.y);
    this.write(11, p2.x);
    this.write(21, p2.y);
  }

  // LWPLINE is a light-weight polyline (efficient)
  lwpolyline(pts: { x: number; y: number }[], closed: boolean, layerName: string): void {
    if (pts.length < 2) return;
    this.entity('LWPOLYLINE');
    this.layer(layerName);
    this.write(100, 'AcDbEntity');
    this.write(100, 'AcDbPolyline');
    this.write(90, pts.length);
    this.write(70, closed ? 1 : 0);
    this.write(43, 0);
    for (const p of pts) {
      this.write(10, p.x);
      this.write(20, p.y);
    }
  }

  circle(cx: number, cy: number, r: number, layerName: string): void {
    this.entity('CIRCLE');
    this.layer(layerName);
    this.write(10, cx);
    this.write(20, cy);
    this.write(40, r);
  }

  text(x: number, y: number, content: string, height: number, layerName: string, rotationDeg = 0): void {
    this.entity('TEXT');
    this.layer(layerName);
    this.write(10, x);
    this.write(20, y);
    this.write(40, height);
    this.write(1, content);
    this.write(50, rotationDeg);
    this.write(72, 0);
    this.write(11, x);
    this.write(21, y);
  }

  mtext(x: number, y: number, content: string, height: number, width: number, layerName: string): void {
    this.entity('MTEXT');
    this.layer(layerName);
    this.write(100, 'AcDbEntity');
    this.write(100, 'AcDbMText');
    this.write(10, x);
    this.write(20, y);
    this.write(40, height);
    this.write(41, width);
    this.write(1, content);
    this.write(71, 1);
    this.write(72, 5);
  }

  insert(x: number, y: number, blockName: string, layerName: string, scale = 1): void {
    this.entity('INSERT');
    this.layer(layerName);
    this.write(2, blockName);
    this.write(10, x);
    this.write(20, y);
    this.write(41, scale);
    this.write(42, scale);
  }

  point(x: number, y: number, layerName: string): void {
    this.entity('POINT');
    this.layer(layerName);
    this.write(10, x);
    this.write(20, y);
  }

  private blocks(): void {
    this.section('BLOCKS');
    // CM marker block
    this.write(0, 'BLOCK');
    this.write(5, this.nextHandle());
    this.write(100, 'AcDbEntity');
    this.write(8, '0');
    this.write(2, 'CM-MARKER');
    this.write(70, 0);
    this.write(10, 0);
    this.write(20, 0);
    this.write(0, 'CIRCLE');
    this.write(8, 'CM-CR');
    this.write(10, 0);
    this.write(20, 0);
    this.write(40, 0.12);
    this.write(0, 'CIRCLE');
    this.write(8, 'CM-CR');
    this.write(10, 0);
    this.write(20, 0);
    this.write(40, 0.06);
    this.write(0, 'LINE');
    this.write(8, 'CM-CR');
    this.write(10, -0.04);
    this.write(20, 0);
    this.write(11, 0.04);
    this.write(21, 0);
    this.write(0, 'LINE');
    this.write(8, 'CM-CR');
    this.write(10, 0);
    this.write(20, -0.04);
    this.write(11, 0);
    this.write(21, 0.04);
    this.write(0, 'ENDBLK');

    // CR marker block
    this.write(0, 'BLOCK');
    this.write(5, this.nextHandle());
    this.write(100, 'AcDbEntity');
    this.write(8, '0');
    this.write(2, 'CR-MARKER');
    this.write(70, 0);
    this.write(10, 0);
    this.write(20, 0);
    this.write(0, 'CIRCLE');
    this.write(8, 'CM-CR');
    this.write(10, 0);
    this.write(20, 0);
    this.write(40, 0.1);
    this.write(0, 'LINE');
    this.write(8, 'CM-CR');
    this.write(10, -0.07);
    this.write(20, 0);
    this.write(11, 0.07);
    this.write(21, 0);
    this.write(0, 'LINE');
    this.write(8, 'CM-CR');
    this.write(10, 0);
    this.write(20, -0.07);
    this.write(11, 0);
    this.write(21, 0.07);
    this.write(0, 'ENDBLK');

    // North arrow block
    this.write(0, 'BLOCK');
    this.write(5, this.nextHandle());
    this.write(100, 'AcDbEntity');
    this.write(8, '0');
    this.write(2, 'NORTH-ARROW');
    this.write(70, 0);
    this.write(10, 0);
    this.write(20, 0);
    this.write(0, 'SOLID');
    this.write(8, 'ANNOTATION');
    this.write(10, 0);
    this.write(20, 0.5);
    this.write(11, -0.15);
    this.write(21, -0.1);
    this.write(12, 0.15);
    this.write(22, -0.1);
    this.write(13, 0);
    this.write(23, 0.05);
    this.write(0, 'TEXT');
    this.write(8, 'ANNOTATION');
    this.write(10, 0);
    this.write(20, 0.6);
    this.write(40, 0.12);
    this.write(1, 'N');
    this.write(50, 0);
    this.write(72, 1);
    this.write(11, 0);
    this.write(21, 0.6);
    this.write(0, 'ENDBLK');

    this.endSection();
  }

  private entities(): void {
    this.section('ENTITIES');
  }

  toString(): string {
    // Build all sections
    this.header();
    this.tables();
    this.blocks();
    this.entities();

    return this.lines.join('\n') + '\n0\nENDSEC\n0\nEOF\n';
  }
}
