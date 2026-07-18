import type { StructuralGraph, CompressionLevel } from './graphModel';
import { buildGraph, compressGraph, estimateTokens } from './graphModel';
import type { SlabPolygon, ColumnElement, ShearWallElement } from './types';

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export interface HeadroomConfig {
  /** Soft limit — warning fires above this (tokens) */
  warningLimit: number;
  /** Hard limit — auto-compression fires above this (tokens) */
  hardLimit: number;
  /** Maximum compression level allowed */
  maxCompression: CompressionLevel;
  /** Log to console when compression triggers */
  verbose: boolean;
}

const DEFAULT_CONFIG: HeadroomConfig = {
  warningLimit: 800,
  hardLimit: 1500,
  maxCompression: 2,
  verbose: false,
};

// ─────────────────────────────────────────────────────────────
// Status report
// ─────────────────────────────────────────────────────────────

export type HeadroomLevel = 'green' | 'yellow' | 'red' | 'critical';

export interface HeadroomReport {
  tokens: number;
  limit: number;
  level: HeadroomLevel;
  compression: CompressionLevel;
  message: string;
  graph: StructuralGraph;
}

// ─────────────────────────────────────────────────────────────
// Headroom Engine
// ─────────────────────────────────────────────────────────────

export class Headroom {
  private config: HeadroomConfig;
  private _compression: CompressionLevel = 0;
  private _lastTokens = 0;
  private _lastLevel: HeadroomLevel = 'green';

  constructor(config?: Partial<HeadroomConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get compression(): CompressionLevel { return this._compression; }
  get lastTokens(): number { return this._lastTokens; }
  get lastLevel(): HeadroomLevel { return this._lastLevel; }

  /** Build a graph from the model and apply auto-compression if needed */
  process(
    slab: SlabPolygon | null,
    columns: ColumnElement[],
    walls: ShearWallElement[],
    ppm: number,
    imgW?: number,
    imgH?: number,
  ): HeadroomReport {
    let graph = buildGraph(slab, columns, walls, ppm, imgW, imgH);
    let tokens = estimateTokens(graph);
    let compression: CompressionLevel = 0;

    // Auto-compress if over hard limit
    if (tokens > this.config.hardLimit) {
      compression = Math.min(2, this.config.maxCompression) as CompressionLevel;
      graph = compressGraph(graph, compression);
      tokens = estimateTokens(graph);
      if (this.config.verbose) {
        console.warn(`[Headroom] Over hard limit (${tokens} > ${this.config.hardLimit}), compressed to level ${compression}`);
      }
    }

    // Further compress if still over
    if (tokens > this.config.hardLimit && this.config.maxCompression >= 3) {
      compression = 3;
      graph = compressGraph(graph, 3);
      tokens = estimateTokens(graph);
    }

    // Determine level
    let level: HeadroomLevel;
    let message: string;

    if (tokens > this.config.hardLimit) {
      level = 'critical';
      message = `CRITICAL: ${tokens} tokens (limit ${this.config.hardLimit})`;
    } else if (tokens > this.config.warningLimit * 1.5) {
      level = 'red';
      message = `High: ${tokens} tokens — consider simplifying model`;
    } else if (tokens > this.config.warningLimit) {
      level = 'yellow';
      message = `Moderate: ${tokens} tokens (limit ${this.config.warningLimit})`;
    } else {
      level = 'green';
      message = `Good: ${tokens} tokens`;
    }

    this._compression = compression;
    this._lastTokens = tokens;
    this._lastLevel = level;

    return { tokens, limit: this.config.hardLimit, level, compression, message, graph };
  }

  /** Manually compress the current graph to a specific level */
  compress(graph: StructuralGraph, level: CompressionLevel): StructuralGraph {
    const compressed = compressGraph(graph, Math.min(level, this.config.maxCompression) as CompressionLevel);
    this._compression = level;
    return compressed;
  }

  /** Get the latest report without processing a new graph */
  getReport(): HeadroomReport | null {
    if (this._lastTokens === 0) return null;
    let level: HeadroomLevel;
    let message: string;

    if (this._lastTokens > this.config.hardLimit) {
      level = 'critical';
      message = `CRITICAL: ${this._lastTokens} tokens (limit ${this.config.hardLimit})`;
    } else if (this._lastTokens > this.config.warningLimit * 1.5) {
      level = 'red';
      message = `High: ${this._lastTokens} tokens — consider simplifying model`;
    } else if (this._lastTokens > this.config.warningLimit) {
      level = 'yellow';
      message = `Moderate: ${this._lastTokens} tokens (limit ${this.config.warningLimit})`;
    } else {
      level = 'green';
      message = `Good: ${this._lastTokens} tokens`;
    }

    return {
      tokens: this._lastTokens,
      limit: this.config.hardLimit,
      level,
      compression: this._compression,
      message,
      graph: { v: 0, n: [], e: [], m: {} },
    };
  }

  /** Update config at runtime */
  setConfig(cfg: Partial<HeadroomConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  /** Get token budget delta — how many tokens remain before hard limit */
  headroom(tokens: number): number {
    return Math.max(0, this.config.hardLimit - tokens);
  }

  /** Auto-estimate without building the graph (cheap check) */
  estimateQuick(colCount: number, wallCount: number, slabVtxCount: number): number {
    // Baseline: metrics + header = ~80 tokens
    // Each column: ~15 tokens
    // Each wall: ~25 tokens (2 nodes + edge)
    // Each slab vertex: ~8 tokens
    return 80 + colCount * 15 + wallCount * 25 + slabVtxCount * 8;
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton instance for app-wide use
// ─────────────────────────────────────────────────────────────

export const headroom = new Headroom({ verbose: true });
