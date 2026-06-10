export interface Trend { slopePerMin: number; r2: number; n: number; }

// Ordinary least squares over (x, y) pairs where y is present. Returns null when a
// line can't be fit (fewer than 3 points, or no x spread).
export function linearTrend(xsMs: number[], ys: (number | null)[]): Trend | null {
  const xs: number[] = [];
  const vals: number[] = [];
  const len = Math.min(xsMs.length, ys.length);
  for (let i = 0; i < len; i++) {
    const y = ys[i];
    if (y !== null && Number.isFinite(y)) {
      xs.push(xsMs[i]);
      vals.push(y);
    }
  }
  const n = xs.length;
  if (n < 3) return null;

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = vals.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = vals[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slopePerMs = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slopePerMin: slopePerMs * 60_000, r2, n };
}
