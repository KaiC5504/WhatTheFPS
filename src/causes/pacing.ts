import type { WindowAnalysis, WindowClassification } from '../types';
import { computeStats } from '../stats/percentiles';

export interface SpikeCluster { startRow: number; endRow: number; peakMs: number; }

// Below this many gameplay samples, pacing percentiles are noise — every function
// in this module goes silent rather than guessing.
const MIN_SAMPLES = 20;
const SPIKE_FACTOR = 2;  // a sample 2× the gameplay median counts as a spike
const MIN_RUN = 2;       // ≥2 consecutive spiked polls = a cluster, not a one-poll artefact
// A poll averaging over 100 ms (<10 FPS) is a freeze/load/scene-cut, not micro-stutter.
// Benchmarks (e.g. Superposition) cycle through scenes with multi-second load stalls that
// would otherwise dominate p99/avg and fake a stutter verdict — exclude them from pacing math.
const STALL_CEIL_MS = 100;

// Row indexes covered by gameplay windows — pacing math must ignore menus/loading,
// where frame times legitimately spike.
export function gameplayRowSet(wa: WindowAnalysis): Set<number> {
  const rows = new Set<number>();
  for (const w of wa.windows) {
    if (w.activity !== 'gameplay') continue;
    for (let i = w.window.startRow; i <= w.window.endRow; i++) rows.add(i);
  }
  return rows;
}

function inPlay(series: (number | null)[], rows: Set<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (rows.has(i) && v !== null && Number.isFinite(v) && v > 0 && v <= STALL_CEIL_MS) out.push(v);
  }
  return out;
}

// p99/avg of gameplay frame-time samples. 1.0 = perfectly even pacing; 2.0 means the
// worst 1% of polls averaged twice the typical frame time.
export function stutterIndex(series: (number | null)[], rows: Set<number>): number | null {
  const vals = inPlay(series, rows);
  if (vals.length < MIN_SAMPLES) return null;
  const s = computeStats(vals);
  if (s.avg <= 0) return null;
  return s.p99 / s.avg;
}

export function gameplayMedian(series: (number | null)[], rows: Set<number>): number | null {
  const vals = inPlay(series, rows).sort((a, b) => a - b);
  return vals.length >= MIN_SAMPLES ? vals[Math.floor(vals.length / 2)] : null;
}

export function spikeRows(series: (number | null)[], rows: Set<number>): number[] {
  const median = gameplayMedian(series, rows);
  if (median === null || median <= 0) return [];
  const threshold = SPIKE_FACTOR * median;
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (rows.has(i) && v !== null && v > threshold && v <= STALL_CEIL_MS) out.push(i);
  }
  return out;
}

export function spikeClusters(series: (number | null)[], rows: Set<number>): SpikeCluster[] {
  const idx = spikeRows(series, rows);
  const clusters: SpikeCluster[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (idx[j] - idx[i] + 1 >= MIN_RUN) {
      let peak = 0;
      for (let k = idx[i]; k <= idx[j]; k++) peak = Math.max(peak, series[k] ?? 0);
      clusters.push({ startRow: idx[i], endRow: idx[j], peakMs: peak });
    }
    i = j + 1;
  }
  return clusters;
}

export function rowsToWindowIndexes(rowIdx: number[], windows: WindowClassification[]): number[] {
  const out = new Set<number>();
  for (const w of windows) {
    for (const r of rowIdx) {
      if (r >= w.window.startRow && r <= w.window.endRow) { out.add(w.window.index); break; }
    }
  }
  return [...out].sort((a, b) => a - b);
}
