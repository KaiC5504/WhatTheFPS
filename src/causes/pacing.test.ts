import { describe, it, expect } from 'vitest';
import { gameplayRowSet, stutterIndex, gameplayMedian, spikeRows, spikeClusters, rowsToWindowIndexes } from './pacing';
import { makeWindow, makeWindowAnalysis } from './testkit';

const allRows = (n: number) => new Set(Array.from({ length: n }, (_, i) => i));

describe('gameplayRowSet', () => {
  it('covers gameplay windows only', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { activity: 'idle' }),
      makeWindow(1),                          // gameplay, rows 4..7
      makeWindow(2, { activity: 'loading' }),
    ]);
    expect([...gameplayRowSet(wa)].sort((a, b) => a - b)).toEqual([4, 5, 6, 7]);
  });
});

describe('stutterIndex', () => {
  it('reads ~1 for even pacing and rises with a heavy tail', () => {
    const flat = Array.from({ length: 100 }, () => 10);
    expect(stutterIndex(flat, allRows(100))).toBeCloseTo(1, 5);
    const spiky = [...Array.from({ length: 98 }, () => 10), 40, 40];
    expect(stutterIndex(spiky, allRows(100))!).toBeGreaterThan(2);
  });

  it('ignores rows outside gameplay and is null on thin or all-null data', () => {
    const series = [...Array.from({ length: 30 }, () => 10), 80, 80]; // spikes after gameplay ends
    const rows = new Set(Array.from({ length: 30 }, (_, i) => i));
    expect(stutterIndex(series, rows)).toBeCloseTo(1, 5);
    expect(stutterIndex([10, 10, 10], allRows(3))).toBeNull();        // < MIN_SAMPLES
    expect(stutterIndex(Array.from({ length: 50 }, () => null), allRows(50))).toBeNull();
    expect(stutterIndex([], new Set())).toBeNull();
  });
});

describe('spikeRows / spikeClusters', () => {
  it('flags samples above 2× the gameplay median and keeps only runs of ≥2 as clusters', () => {
    const s: (number | null)[] = Array.from({ length: 40 }, () => 8);
    s[10] = 20;                            // lone spike — a row but not a cluster
    s[20] = 25; s[21] = 30; s[22] = 22;    // 3-run cluster
    expect(spikeRows(s, allRows(40))).toEqual([10, 20, 21, 22]);
    expect(spikeClusters(s, allRows(40))).toEqual([{ startRow: 20, endRow: 22, peakMs: 30 }]);
  });

  it('is empty when the gameplay median cannot be established', () => {
    expect(spikeClusters(Array.from({ length: 40 }, () => null), allRows(40))).toEqual([]);
    expect(spikeClusters([], new Set())).toEqual([]);
    expect(gameplayMedian([], new Set())).toBeNull();
  });
});

describe('rowsToWindowIndexes', () => {
  it('maps rows to the windows containing them, deduped and sorted', () => {
    const wa = makeWindowAnalysis([makeWindow(0), makeWindow(1), makeWindow(2)]);
    expect(rowsToWindowIndexes([5, 6, 9], wa.windows)).toEqual([1, 2]);
    expect(rowsToWindowIndexes([], wa.windows)).toEqual([]);
  });
});
