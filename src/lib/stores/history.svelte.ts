import type { ColumnElement, ShearWallElement, SlabPolygon, Dimension, PolylineWallElement, BeamElement, DropPanelElement } from '../engine/types';

export interface ModelSnapshot {
  columns: ColumnElement[];
  walls: ShearWallElement[];
  polylineWalls: PolylineWallElement[];
  beams: BeamElement[];
  slabs: SlabPolygon[];
  dropPanels: DropPanelElement[];
  dimensions: Dimension[];
}

export class HistoryManager {
  private stack: ModelSnapshot[] = [];
  private index = $state(-1);
  private maxSize: number = 50;

  push(snapshot: ModelSnapshot): void {
    this.stack.length = this.index + 1;
    this.stack.push(JSON.parse(JSON.stringify(snapshot)));
    this.index = this.stack.length - 1;
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
      this.index--;
    }
  }

  undo(): ModelSnapshot | null {
    if (this.index > 0) {
      this.index--;
      return JSON.parse(JSON.stringify(this.stack[this.index]));
    }
    return null;
  }

  redo(): ModelSnapshot | null {
    if (this.index < this.stack.length - 1) {
      this.index++;
      return JSON.parse(JSON.stringify(this.stack[this.index]));
    }
    return null;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  reset(): void {
    this.stack = [];
    this.index = -1;
  }
}
