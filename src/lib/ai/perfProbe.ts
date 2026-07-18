type FpsCallback = (fps: number, frameTimeMs: number) => void;

let _running = false;
let _lastFrame = 0;
let _frameCount = 0;
let _lastFpsUpdate = 0;
let _callback: FpsCallback | null = null;
let _rafId: number | null = null;
const _history: number[] = [];

const UPDATE_INTERVAL_MS = 500;

function _tick(now: number): void {
  if (!_running) return;

  _frameCount++;
  const elapsed = now - _lastFpsUpdate;

  if (elapsed >= UPDATE_INTERVAL_MS) {
    const fps = Math.round((_frameCount * 1000) / elapsed);
    const frameTime = elapsed / _frameCount;
    _history.push(fps);
    if (_history.length > 120) _history.shift();
    if (_callback) _callback(fps, frameTime);
    _frameCount = 0;
    _lastFpsUpdate = now;
  }

  _lastFrame = now;
  _rafId = requestAnimationFrame(_tick);
}

export function startPerfProbe(callback: FpsCallback): void {
  if (_running) return;
  _running = true;
  _callback = callback;
  _lastFrame = performance.now();
  _lastFpsUpdate = _lastFrame;
  _frameCount = 0;
  _rafId = requestAnimationFrame(_tick);
}

export function stopPerfProbe(): void {
  _running = false;
  _callback = null;
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

export { startPerfProbe as perfProbeStart, stopPerfProbe as perfProbeStop, isRunning as perfProbeIsRunning };

export function isRunning(): boolean {
  return _running;
}

export function getCurrentFps(): number | null {
  if (!_running) return null;
  const now = performance.now();
  const elapsed = now - _lastFpsUpdate;
  if (elapsed === 0) return 0;
  return Math.round((_frameCount * 1000) / elapsed);
}

export function getPerfHistory(): number[] {
  return [..._history];
}