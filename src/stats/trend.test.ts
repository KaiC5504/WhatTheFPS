import { describe, it, expect } from 'vitest';
import { linearTrend } from './trend';

describe('linearTrend', () => {
  it('fits a clean decline', () => {
    const xs = [0, 60_000, 120_000, 180_000];
    const ys = [100, 90, 80, 70];
    const t = linearTrend(xs, ys)!;
    expect(t.slopePerMin).toBeCloseTo(-10, 5);
    expect(t.r2).toBeCloseTo(1, 5);
    expect(t.n).toBe(4);
  });

  it('reports near-zero r2 for noise and skips nulls', () => {
    const xs = [0, 60_000, 120_000, 180_000, 240_000];
    const ys = [100, null, 100, 100, 100];
    const t = linearTrend(xs, ys)!;
    expect(t.n).toBe(4);
    expect(Math.abs(t.slopePerMin)).toBeLessThan(1e-9);
  });

  it('returns null with fewer than 3 points or zero x-variance', () => {
    expect(linearTrend([0, 1], [1, 2])).toBeNull();
    expect(linearTrend([5, 5, 5], [1, 2, 3])).toBeNull();
  });

  it('bimodal series (two flat regimes) fits poorly', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i * 10_000);
    const ys = xs.map((_, i) => (i % 2 === 0 ? 120 : 60));   // alternating, not a trend
    const t = linearTrend(xs, ys)!;
    expect(t.r2).toBeLessThan(0.3);
  });
});
