import type { CanonicalKey, Stats } from '../types';

// Linear interpolation between closest ranks on a 0..(n-1) index basis
// (numpy 'linear' / Excel PERCENTILE.INC).
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

// Mean of the lowest `fraction` of samples — the gamer "1% low" convention.
// Always keeps at least one sample so small arrays don't collapse to NaN.
function lowTailMean(sorted: number[], fraction: number): number {
  const k = Math.max(1, Math.floor(sorted.length * fraction));
  let sum = 0;
  for (let i = 0; i < k; i++) sum += sorted[i];
  return sum / k;
}

// Detector-convention median: sorted[floor(n/2)], picking one element instead of
// averaging the two middles (the true-median convention lives in sensors/normalize).
export function medianLower(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)];
}

export function statMax(stats: Partial<Record<CanonicalKey, Stats>>, keys: CanonicalKey[]): number | null {
  let m: number | null = null;
  for (const k of keys) {
    const s = stats[k];
    if (s && s.count > 0) m = m === null ? s.max : Math.max(m, s.max);
  }
  return m;
}

export function statAvg(stats: Partial<Record<CanonicalKey, Stats>>, key: CanonicalKey): number | null {
  const s = stats[key];
  return s && s.count > 0 ? s.avg : null;
}

export function computeStats(values: (number | null)[]): Stats {
  const nums: number[] = [];
  for (const v of values) if (v !== null && Number.isFinite(v)) nums.push(v);

  if (nums.length === 0) {
    return { count: 0, avg: 0, min: 0, max: 0, p5: 0, p95: 0, p99: 0, p1Low: 0, p5Low: 0 };
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((acc, n) => acc + n, 0);

  return {
    count: nums.length,
    avg: sum / nums.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p5: percentile(sorted, 5),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    p1Low: lowTailMean(sorted, 0.01),
    p5Low: lowTailMean(sorted, 0.05),
  };
}
