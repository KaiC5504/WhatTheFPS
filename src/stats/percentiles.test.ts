import { describe, it, expect } from 'vitest';
import { computeStats } from './percentiles';

describe('computeStats', () => {
  // Percentiles use linear interpolation between closest ranks on a 0..(n-1)
  // index basis (numpy 'linear' / Excel PERCENTILE.INC). For [10..100], n=10:
  //   p5  = 10 + 0.45*10 = 14.5   (rank 0.05*9 = 0.45)
  //   p95 = 90 + 0.55*10 = 95.5   (rank 0.95*9 = 8.55)
  //   p99 = 90 + 0.91*10 = 99.1   (rank 0.99*9 = 8.91)
  const seq = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it('computes avg/min/max and interpolated percentiles', () => {
    const s = computeStats(seq);
    expect(s.count).toBe(10);
    expect(s.avg).toBe(55);
    expect(s.min).toBe(10);
    expect(s.max).toBe(100);
    expect(s.p5).toBeCloseTo(14.5, 5);
    expect(s.p95).toBeCloseTo(95.5, 5);
    expect(s.p99).toBeCloseTo(99.1, 5);
  });

  it('1%/5% lows are the mean of the lowest 1%/5% of samples', () => {
    // n=100: lowest 1% = 1 sample (=1), lowest 5% = 5 samples (mean 1..5 = 3)
    const big = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = computeStats(big);
    expect(s.p1Low).toBe(1);
    expect(s.p5Low).toBe(3);
  });

  it('low-tail keeps at least one sample for small arrays', () => {
    const s = computeStats(seq);
    expect(s.p1Low).toBe(10);
    expect(s.p5Low).toBe(10);
  });

  it('ignores nulls', () => {
    const s = computeStats([10, null, 20, null, 30]);
    expect(s.count).toBe(3);
    expect(s.avg).toBe(20);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
  });

  it('all-null returns zeros, never NaN', () => {
    const s = computeStats([null, null]);
    expect(s).toEqual({ count: 0, avg: 0, min: 0, max: 0, p5: 0, p95: 0, p99: 0, p1Low: 0, p5Low: 0 });
    for (const v of Object.values(s)) expect(Number.isNaN(v)).toBe(false);
  });
});
