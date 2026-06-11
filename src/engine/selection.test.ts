import { describe, it, expect } from 'vitest';
import { computeSelection } from './selection';
import { computeStats } from '../stats/percentiles';
import { makeLog, makeWindow, makeWindowAnalysis } from '../causes/testkit';

function logWithTimes() {
  const log = makeLog({
    sensors: {
      'gpu.temp': [70, 72, 80, 85, 84, 71],
      'cpu.usageTotal': [40, 45, 90, 95, 92, 41],
    },
    fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', series: [100, 98, 45, 40, 44, 99] },
  });
  log.timesMs = [0, 2000, 4000, 6000, 8000, 10000];
  return log;
}

describe('computeSelection', () => {
  it('sub-range stats match computeStats of the same slice', () => {
    const sel = computeSelection(logWithTimes(), makeWindowAnalysis([]), 2, 4);
    expect(sel.fps).toEqual(computeStats([45, 40, 44]));
    expect(sel.sensors['gpu.temp']).toEqual(computeStats([80, 85, 84]));
    expect(sel.sensors['cpu.usageTotal']).toEqual(computeStats([90, 95, 92]));
    expect(sel.startRow).toBe(2);
    expect(sel.endRow).toBe(4);
    expect(sel.startMs).toBe(4000);
    expect(sel.endMs).toBe(8000);
  });

  it('time-split counts only windows fully inside the row range, reusing their classification', () => {
    // makeWindow(i) spans rows i*4 .. i*4+3; selection 0..9 contains windows 0 and 1
    // fully, window 2 only partially.
    const wa = makeWindowAnalysis([
      makeWindow(0, { activity: 'idle' }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(2, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const log = makeLog({ sensors: { 'gpu.temp': Array(12).fill(70) } });
    log.timesMs = Array.from({ length: 12 }, (_, i) => i * 2000);

    const sel = computeSelection(log, wa, 0, 9);
    expect(sel.windowCount).toBe(2);
    expect(sel.timeSplit).not.toBeNull();
    // only window 1 is gameplay; the idle window contributes no gameplay time
    expect(sel.timeSplit!.shares.gpu).toBeCloseTo(1);
    expect(sel.timeSplit!.gameplayMs).toBe(6000);
  });

  it('returns null timeSplit when no window fits fully inside', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } })]);
    const sel = computeSelection(logWithTimes(), wa, 1, 2); // window 0 spans rows 0..3
    expect(sel.timeSplit).toBeNull();
    expect(sel.windowCount).toBe(0);
  });

  it('fps is null when the source is none or the slice is all-null', () => {
    const noFps = makeLog({ sensors: { 'gpu.temp': [70, 71, 72] } });
    noFps.timesMs = [0, 2000, 4000];
    expect(computeSelection(noFps, makeWindowAnalysis([]), 0, 2).fps).toBeNull();

    const gappy = logWithTimes();
    gappy.fps.series = [100, null, null, null, null, 99];
    expect(computeSelection(gappy, makeWindowAnalysis([]), 1, 4).fps).toBeNull();
  });

  it('degenerate ranges return safe nulls', () => {
    const empty = computeSelection(makeLog({}), makeWindowAnalysis([]), 0, 5);
    expect(empty).toMatchObject({ fps: null, sensors: {}, timeSplit: null, windowCount: 0 });

    const inverted = computeSelection(logWithTimes(), makeWindowAnalysis([]), 4, 2);
    expect(inverted).toMatchObject({ fps: null, sensors: {}, timeSplit: null, windowCount: 0 });
  });

  it('clamps rows that fall outside the log', () => {
    const sel = computeSelection(logWithTimes(), makeWindowAnalysis([]), 4, 999);
    expect(sel.endRow).toBe(5);
    expect(sel.fps).toEqual(computeStats([44, 99]));
  });
});
