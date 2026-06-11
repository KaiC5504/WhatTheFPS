import { describe, it, expect } from 'vitest';
import { decimateRows, timeToRow, DECIMATE_THRESHOLD, DECIMATE_TARGET } from './decimate';

describe('timeToRow', () => {
  // duplicate run at rows 2..4: HWiNFO forward-fills timestamps when logging pauses
  const times = [0, 2000, 4000, 4000, 4000, 6000];

  it('maps an exact time to the FIRST index of its duplicate run', () => {
    expect(timeToRow(times, 4000)).toBe(2);
    expect(timeToRow(times, 0)).toBe(0);
    expect(timeToRow(times, 6000)).toBe(5);
  });

  it('maps a between-samples time to the nearest row', () => {
    expect(timeToRow(times, 2900)).toBe(1);  // 2000 is closer
    expect(timeToRow(times, 3100)).toBe(2);  // 4000 is closer → first of run
    expect(timeToRow(times, 5000)).toBe(2);  // exact tie resolves low → first of run
  });

  it('clamps out-of-range times', () => {
    expect(timeToRow(times, -500)).toBe(0);
    expect(timeToRow(times, 99999)).toBe(5);
    expect(timeToRow([], 1000)).toBe(0);
  });

  it('a trailing duplicate run resolves to its first index', () => {
    expect(timeToRow([0, 2000, 2000, 2000], 9000)).toBe(1);
  });
});

describe('decimateRows', () => {
  it('passes small logs through untouched', () => {
    const rows = decimateRows(DECIMATE_THRESHOLD, [Array(DECIMATE_THRESHOLD).fill(60)]);
    expect(rows).toHaveLength(DECIMATE_THRESHOLD);
    expect(rows[0]).toBe(0);
    expect(rows[rows.length - 1]).toBe(DECIMATE_THRESHOLD - 1);
  });

  it('keeps a single 1-row dip when decimating', () => {
    const n = 30000;
    const series: (number | null)[] = Array(n).fill(100);
    series[12345] = 5;
    const rows = decimateRows(n, [series]);
    expect(rows.length).toBeLessThanOrEqual(DECIMATE_TARGET);
    expect(rows).toContain(12345);
  });

  it('preserves null gaps so the line still breaks', () => {
    const n = 30000;
    const series: (number | null)[] = Array(n).fill(100);
    for (let i = 9000; i < 9100; i++) series[i] = null;
    const rows = decimateRows(n, [series]);
    expect(rows.some((r) => r >= 9000 && r < 9100 && series[r] === null)).toBe(true);
  });

  it('stays under the target with two series and preserves both their spikes', () => {
    const n = 50000;
    const a: (number | null)[] = Array(n).fill(100);
    const b: (number | null)[] = Array(n).fill(70);
    a[1111] = 3;
    b[44444] = 99;
    const rows = decimateRows(n, [a, b]);
    expect(rows.length).toBeLessThanOrEqual(DECIMATE_TARGET);
    expect(rows).toContain(1111);
    expect(rows).toContain(44444);
    // strictly ascending — uPlot requires sorted x
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThan(rows[i - 1]);
  });

  it('falls back to stride sampling when no series is present', () => {
    const rows = decimateRows(30000, [undefined, undefined]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(DECIMATE_TARGET);
  });
});
