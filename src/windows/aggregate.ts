import type { Limiter, TimeSplit, TimeWindow, WindowClassification, WorstMoment } from '../types';
import { buildSnapshot } from './snapshot';
import { medianLower } from '../stats/percentiles';

const DOMINANT_SHARE = 0.4;
const WORST_COUNT = 3;
const WORST_MIN_GAP = 2;       // picked windows must be ≥2 indexes apart
const WORST_MIN_DROP_PCT = 10; // a "worst moment" must actually be a drop

const dur = (w: TimeWindow) => Math.max(w.endMs - w.startMs, 1);

export function buildTimeSplit(classified: WindowClassification[]): TimeSplit {
  const totalMs = classified.reduce((s, c) => s + dur(c.window), 0);
  const gameplay = classified.filter((c) => c.activity === 'gameplay');
  const gameplayMs = gameplay.reduce((s, c) => s + dur(c.window), 0);

  const shares: Partial<Record<Limiter, number>> = {};
  if (gameplayMs > 0) {
    for (const c of gameplay) shares[c.limiter] = (shares[c.limiter] ?? 0) + dur(c.window) / gameplayMs;
  }

  let dominant: TimeSplit['dominant'] = null;
  if (gameplayMs > 0) {
    let best: Limiter | null = null;
    for (const [k, v] of Object.entries(shares) as [Limiter, number][]) {
      if (k === 'unknown') continue;
      if (best === null || v > (shares[best] ?? 0)) best = k;
    }
    // best === null means every gameplay window was unclassifiable → inconclusive, not "mixed"
    dominant = best === null ? null : (shares[best] ?? 0) >= DOMINANT_SHARE ? best : 'mixed';
  }
  return { gameplayMs, totalMs, shares, dominant };
}

export function pickWorst(classified: WindowClassification[]): WorstMoment[] {
  const gameplay = classified.filter((c) => c.activity === 'gameplay');
  const withFps = gameplay.filter((c) => c.metrics.fpsAvg !== null);

  const fpsSorted = withFps.map((c) => c.metrics.fpsAvg as number).sort((a, b) => a - b);
  const median = fpsSorted.length ? medianLower(fpsSorted) : null;

  const pool = withFps.length > 0
    ? [...withFps].sort((a, b) => (a.metrics.fpsAvg as number) - (b.metrics.fpsAvg as number))
    : gameplay.filter((c) => c.metrics.frameTimeMs !== null)
        .sort((a, b) => (b.metrics.frameTimeMs as number) - (a.metrics.frameTimeMs as number));

  const picked: WindowClassification[] = [];
  for (const c of pool) {
    if (picked.length >= WORST_COUNT) break;
    if (picked.some((p) => Math.abs(p.window.index - c.window.index) < WORST_MIN_GAP)) continue;
    if (median !== null && c.metrics.fpsAvg !== null) {
      const dropPct = ((median - c.metrics.fpsAvg) / median) * 100;
      if (dropPct < WORST_MIN_DROP_PCT) continue; // healthy run — nothing to forensicate
    }
    picked.push(c);
  }

  return picked.map((c) => ({
    classification: c,
    fpsDropPct: median !== null && median > 0 && c.metrics.fpsAvg !== null
      ? ((median - c.metrics.fpsAvg) / median) * 100
      : 0,
    snapshot: buildSnapshot(c.metrics),
  }));
}
