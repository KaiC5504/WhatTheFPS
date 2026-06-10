import { describe, it, expect } from 'vitest';
import { classifyLimiter } from './classify';
import type { WindowMetrics } from '../types';

function m(over: Partial<WindowMetrics>): WindowMetrics {
  return {
    fpsAvg: null, fpsCoverage: 1, frameTimeMs: null, frameTimeMaxMs: null,
    gpuBusyMs: null, cpuBusyMs: null, gpuUsage: null, cpuMaxThread: null, cpuTotal: null,
    gpuPowerW: null, gpuPowerLimitW: null, gpuClockEffMhz: null, cpuClockEffMhz: null,
    gpuTempC: null, cpuTempC: null, vramDedicatedMb: null, vramDynamicMb: null,
    ramLoadPct: null, flagsFired: [], ...over,
  };
}
const NO_CAP = { capped: false, capValue: null };
const CAP120 = { capped: true, capValue: 120 };

describe('cap gate (must run before busy-ratio logic)', () => {
  it('the real-world false positive: 120 cap, CPU Busy 8.03 ≈ frametime 8.33 → capped, NOT cpu', () => {
    const r = classifyLimiter(m({ fpsAvg: 119.8, frameTimeMs: 8.33, gpuBusyMs: 4.23, cpuBusyMs: 8.03 }), CAP120);
    expect(r.limiter).toBe('capped');
    expect(r.tier).toBe('measured');
  });
  it('a cap-paced window hovering a couple FPS under the cap is still capped', () => {
    const r = classifyLimiter(m({ fpsAvg: 117.4, frameTimeMs: 8.5, gpuBusyMs: 4.3 }), CAP120);
    expect(r.limiter).toBe('capped');
  });
  it('capped log but window far below the cap is NOT gated', () => {
    const r = classifyLimiter(m({ fpsAvg: 80, frameTimeMs: 12.5, gpuBusyMs: 12.1 }), CAP120);
    expect(r.limiter).toBe('gpu');
  });
  it('at the cap but the GPU is genuinely maxed (busy ≈ frametime) → gpu, not capped', () => {
    const r = classifyLimiter(m({ fpsAvg: 119.5, frameTimeMs: 8.33, gpuBusyMs: 8.1 }), CAP120);
    expect(r.limiter).toBe('gpu');
  });
});

describe('Tier 1 (PresentMon)', () => {
  it('dev < 10% → gpu, measured', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 16.6, gpuBusyMs: 15.5 }), NO_CAP);
    expect(r).toMatchObject({ limiter: 'gpu', tier: 'measured' });
  });
  it('dev < 10% but power far below limit with no limit flags → underutilized', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 16.6, gpuBusyMs: 15.5, gpuPowerW: 90, gpuPowerLimitW: 175 }), NO_CAP);
    expect(r.limiter).toBe('underutilized');
  });
  it('dev < 10%, power low BUT a power-limit flag fired → still gpu', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 16.6, gpuBusyMs: 15.5, gpuPowerW: 90, gpuPowerLimitW: 175, flagsFired: ['flag.gpu.perfLimitPower'] }), NO_CAP);
    expect(r.limiter).toBe('gpu');
  });
  it('dev > 17.5% → cpu, measured', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 16.6, gpuBusyMs: 11.0, cpuBusyMs: 16.0 }), NO_CAP);
    expect(r).toMatchObject({ limiter: 'cpu', tier: 'measured' });
  });
  it('10% ≤ dev ≤ 17.5% → ambiguous, measured', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 16.6, gpuBusyMs: 14.5 }), NO_CAP);
    expect(r).toMatchObject({ limiter: 'ambiguous', tier: 'measured' });
  });
  it('implausible busy data (busy ≫ frametime) is demoted to Tier 2', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 16.6, gpuBusyMs: 25, gpuUsage: 98 }), NO_CAP);
    expect(r).toMatchObject({ limiter: 'gpu', tier: 'inferred' });
  });
  it('fps↔frametime mismatch (wrong process) is demoted to Tier 2', () => {
    const r = classifyLimiter(m({ fpsAvg: 60, frameTimeMs: 8.3, gpuBusyMs: 8.0, gpuUsage: 98 }), NO_CAP);
    expect(r.tier).toBe('inferred');
  });
});

describe('Tier 2 (no PresentMon)', () => {
  it('GPU ≥ 97% → gpu, inferred', () => {
    expect(classifyLimiter(m({ gpuUsage: 98 }), NO_CAP)).toMatchObject({ limiter: 'gpu', tier: 'inferred' });
  });
  it('GPU ≤ 90% + pinned thread → cpu, inferred', () => {
    expect(classifyLimiter(m({ gpuUsage: 70, cpuMaxThread: 97 }), NO_CAP)).toMatchObject({ limiter: 'cpu', tier: 'inferred' });
  });
  it('GPU ≤ 90% + utilization limit flag → cpu, inferred', () => {
    expect(classifyLimiter(m({ gpuUsage: 70, flagsFired: ['flag.gpu.perfLimitUtil'] }), NO_CAP).limiter).toBe('cpu');
  });
  it('GPU ≤ 90% uncorroborated → ambiguous', () => {
    expect(classifyLimiter(m({ gpuUsage: 70 }), NO_CAP).limiter).toBe('ambiguous');
  });
  it('90–97% band → ambiguous', () => {
    expect(classifyLimiter(m({ gpuUsage: 94 }), NO_CAP).limiter).toBe('ambiguous');
  });
  it('nothing usable → unknown / null tier', () => {
    expect(classifyLimiter(m({}), NO_CAP)).toMatchObject({ limiter: 'unknown', tier: null });
  });
});
