import { describe, it, expect } from 'vitest';
import { windowMean, windowMax, flagsFiredIn, buildMetrics } from './slice';
import { makeLog } from '../detect/testkit';
import type { TimeWindow } from '../types';

const W: TimeWindow = { index: 0, startRow: 1, endRow: 3, startMs: 2000, endMs: 6000 };

describe('window aggregation', () => {
  it('windowMean / windowMax slice by row range and skip nulls', () => {
    expect(windowMean([0, 10, null, 20, 99], W)).toBe(15);
    expect(windowMax([0, 10, null, 20, 99], W)).toBe(20);
    expect(windowMean([null, null, null, null], W)).toBeNull();
    expect(windowMean(undefined, W)).toBeNull();
  });

  it('flagsFiredIn reports any true sample inside the window', () => {
    const log = makeLog({ flags: {
      'flag.gpu.perfLimitPower': [true, false, false, false, false],   // outside W
      'flag.gpu.perfLimitThermal': [false, false, true, false, false], // inside W
    } });
    expect(flagsFiredIn(log.flags, W)).toEqual(['flag.gpu.perfLimitThermal']);
  });

  it('buildMetrics computes fps coverage and falls back PresentMon→RTSS frametime', () => {
    const log = makeLog({
      sensors: { 'rtss.frameTimeMs': [9, 9, 9, 9, 9], 'gpu.usage': [10, 95, 96, 97, 10] },
      fps: { source: 'displayed', series: [null, 110, null, 130, 100] },
    });
    const m = buildMetrics(log, W);
    expect(m.fpsAvg).toBe(120);
    expect(m.fpsCoverage).toBeCloseTo(2 / 3);
    expect(m.frameTimeMs).toBe(9);     // RTSS fallback (no pm.frameTimeMs sensor)
    expect(m.gpuUsage).toBe(96);
  });
});
