import { describe, it, expect } from 'vitest';
import { segmentActivity } from './segment';
import type { WindowMetrics } from '../types';

function m(over: Partial<WindowMetrics>): WindowMetrics {
  return {
    fpsAvg: null, fpsCoverage: 0, frameTimeMs: null, frameTimeMaxMs: null,
    gpuBusyMs: null, cpuBusyMs: null, gpuUsage: null, cpuMaxThread: null, cpuTotal: null,
    gpuPowerW: null, gpuPowerLimitW: null, gpuClockEffMhz: null, cpuClockEffMhz: null,
    gpuTempC: null, cpuTempC: null, vramDedicatedMb: null, vramDynamicMb: null,
    ramLoadPct: null, flagsFired: [], ...over,
  };
}
const play = () => m({ fpsAvg: 100, fpsCoverage: 1, gpuUsage: 95 });
const idle = () => m({ fpsCoverage: 0, gpuUsage: 3, cpuTotal: 8 });
const blank = () => m({ fpsCoverage: 0, gpuUsage: 60, cpuTotal: 40 }); // no fps but loaded

describe('segmentActivity (fps available)', () => {
  it('classifies gameplay / idle, and no-FPS windows adjacent to gameplay become loading', () => {
    const acts = segmentActivity([idle(), blank(), play(), play(), play(), idle()], true);
    expect(acts).toEqual(['idle', 'loading', 'gameplay', 'gameplay', 'gameplay', 'idle']);
  });

  it('smooths a single dissenting window between equal neighbors', () => {
    const acts = segmentActivity([play(), play(), idle(), play(), play(), play()], true);
    expect(acts[2]).toBe('gameplay');
  });
});

describe('segmentActivity (no fps — benchmark logs)', () => {
  it('sustained load is active, the rest idle', () => {
    const cpuLoad = () => m({ cpuTotal: 100, gpuUsage: 5 });
    const acts = segmentActivity([idle(), cpuLoad(), cpuLoad(), cpuLoad(), idle(), idle()], false);
    expect(acts).toEqual(['idle', 'gameplay', 'gameplay', 'gameplay', 'idle', 'idle']);
  });
});
