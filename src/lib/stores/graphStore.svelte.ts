import { headroom, type HeadroomReport } from '../engine/headroom';
import { serializeGraph } from '../engine/graphModel';
import { model } from './structuralModel.svelte';

class GraphStore {
  report = $state<HeadroomReport | null>(null);
  showGraphViewer = $state(false);
  graphJson = $state('');

  refresh(): void {
    const ppm = model.calibrator.pixelsPerMeter;
    const imgW = model.imageNaturalWidth || undefined;
    const imgH = model.imageNaturalHeight || undefined;
    const firstSlab = model.slabs.find(s => s.vertices.length >= 3) ?? null;
    this.report = headroom.process(firstSlab, model.columns, model.walls, ppm, imgW, imgH);
  }

  getJson(): string {
    if (!this.report) return '';
    return serializeGraph(this.report.graph);
  }

  copyToClipboard(): void {
    const json = this.getJson();
    if (!json) return;
    navigator.clipboard.writeText(json).then(() => {
      // silent
    });
  }
}

export const graphStore = new GraphStore();
