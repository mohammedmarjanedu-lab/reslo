export interface PlanLayer {
  id: string;
  name: string;
  image: ImageBitmap | HTMLCanvasElement;
  opacity: number;
  colorTint: 'none' | 'cyan' | 'magenta' | 'yellow' | 'green' | 'red';
  visible: boolean;
  scale: number;
  rotation: number;
  offset: { x: number; y: number };
  width: number;
  height: number;
}

class FloorLayersStore {
  layers = $state<PlanLayer[]>([]);
  activeLayerId = $state<string | null>(null);

  // 2-point alignment wizard state
  alignmentState = $state<{
    active: boolean;
    layerId: string;
    step: 'base1' | 'base2' | 'overlay1' | 'overlay2';
    base1?: { x: number; y: number };
    base2?: { x: number; y: number };
    overlay1?: { x: number; y: number };
    overlay2?: { x: number; y: number };
  } | null>(null);

  startAlignment(layerId: string): void {
    this.alignmentState = {
      active: true,
      layerId,
      step: 'base1'
    };
  }

  cancelAlignment(): void {
    this.alignmentState = null;
  }

  mapBaseImageToOverlayImage(pBase: { x: number; y: number }, layer: PlanLayer): { x: number; y: number } {
    const dx = pBase.x - layer.offset.x;
    const dy = pBase.y - layer.offset.y;
    const cos = Math.cos(layer.rotation);
    const sin = Math.sin(layer.rotation);
    const rx = dx * cos + dy * sin;
    const ry = -dx * sin + dy * cos;
    return {
      x: rx / layer.scale,
      y: ry / layer.scale
    };
  }

  addAlignmentPoint(pBaseImg: { x: number; y: number }): void {
    if (!this.alignmentState) return;
    const layer = this.layers.find(l => l.id === this.alignmentState!.layerId);
    if (!layer) {
      this.alignmentState = null;
      return;
    }

    if (this.alignmentState.step === 'base1') {
      this.alignmentState.base1 = pBaseImg;
      this.alignmentState.step = 'base2';
    } else if (this.alignmentState.step === 'base2') {
      this.alignmentState.base2 = pBaseImg;
      this.alignmentState.step = 'overlay1';
    } else if (this.alignmentState.step === 'overlay1') {
      this.alignmentState.overlay1 = this.mapBaseImageToOverlayImage(pBaseImg, layer);
      this.alignmentState.step = 'overlay2';
    } else if (this.alignmentState.step === 'overlay2') {
      const overlay2 = this.mapBaseImageToOverlayImage(pBaseImg, layer);
      const base1 = this.alignmentState.base1!;
      const base2 = this.alignmentState.base2!;
      const overlay1 = this.alignmentState.overlay1!;

      const dxA = base2.x - base1.x;
      const dyA = base2.y - base1.y;
      const dxB = overlay2.x - overlay1.x;
      const dyB = overlay2.y - overlay1.y;

      const lenA = Math.sqrt(dxA * dxA + dyA * dyA);
      const lenB = Math.sqrt(dxB * dxB + dyB * dyB);

      if (lenB > 1) {
        const scale = lenA / lenB;
        const angleA = Math.atan2(dyA, dxA);
        const angleB = Math.atan2(dyB, dxB);
        const rotation = angleA - angleB;

        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const rotatedB1X = (overlay1.x * cos - overlay1.y * sin) * scale;
        const rotatedB1Y = (overlay1.x * sin + overlay1.y * cos) * scale;

        const offsetX = base1.x - rotatedB1X;
        const offsetY = base1.y - rotatedB1Y;

        this.updateLayer(layer.id, {
          scale,
          rotation,
          offset: { x: offsetX, y: offsetY }
        });
      }
      this.alignmentState = null;
    }
  }

  addLayer(name: string, image: ImageBitmap | HTMLCanvasElement, width: number, height: number): string {
    const id = 'layer_' + Math.random().toString(36).substring(2, 11);
    const newLayer: PlanLayer = {
      id,
      name,
      image,
      opacity: 0.5,
      colorTint: 'none',
      visible: true,
      scale: 1,
      rotation: 0,
      offset: { x: 0, y: 0 },
      width,
      height
    };
    this.layers.push(newLayer);
    if (!this.activeLayerId) {
      this.activeLayerId = id;
    }
    return id;
  }

  updateLayer(id: string, partial: Partial<PlanLayer>): void {
    this.layers = this.layers.map(l => l.id === id ? { ...l, ...partial } : l);
  }

  deleteLayer(id: string): void {
    this.layers = this.layers.filter(l => l.id !== id);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers.length > 0 ? this.layers[0].id : null;
    }
  }

  toggleAllVisibility(): void {
    const allVisible = this.layers.length > 0 && this.layers.every(l => l.visible);
    this.layers = this.layers.map(l => ({ ...l, visible: !allVisible }));
  }

  clearAll(): void {
    this.layers = [];
    this.activeLayerId = null;
    this.alignmentState = null;
  }
}

export const floorLayers = new FloorLayersStore();
