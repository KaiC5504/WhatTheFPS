import { describe, it, expect } from 'vitest';
import { buildTimeSplit, pickWorst } from './aggregate';
import { buildSnapshot } from './snapshot';
import type { WindowClassification, WindowMetrics } from '../types';

function metrics(over: Partial<WindowMetrics>): WindowMetrics {
  return {
    fpsAvg: null, fpsCoverage: 1, frameTimeMs: null, frameTimeMaxMs: null,
    gpuBusyMs: null, cpuBusyMs: null, gpuUsage: null, cpuMaxThread: null, cpuTotal: null,
    gpuPowerW: null, gpuPowerLimitW: null, gpuClockEffMhz: null, cpuClockEffMhz: null,
    gpuTempC: null, cpuTempC: null, vramDedicatedMb: null, vramDynamicMb: null,
    ramLoadPct: null, flagsFired: [], ...over,
  };
}

function win(i: number, activity: WindowClassification['activity'], limiter: WindowClassification['limiter'], fpsAvg: number | null): WindowClassification {
  return {
    window: { index: i, startRow: i * 4, endRow: i * 4 + 3, startMs: i * 8000, endMs: i * 8000 + 6000 },
    activity, limiter, tier: 'measured', basis: [], metrics: metrics({ fpsAvg }),
  };
}

describe('buildTimeSplit', () => {
  it('shares are gameplay-only, duration-weighted; dominant needs ≥40%', () => {
    const split = buildTimeSplit([
      win(0, 'idle', 'unknown', null),
      win(1, 'gameplay', 'gpu', 100), win(2, 'gameplay', 'gpu', 100), win(3, 'gameplay', 'gpu', 100),
      win(4, 'gameplay', 'cpu', 80), win(5, 'gameplay', 'ambiguous', 90),
    ]);
    expect(split.shares.gpu).toBeCloseTo(0.6);
    expect(split.shares.cpu).toBeCloseTo(0.2);
    expect(split.dominant).toBe('gpu');
    expect(split.gameplayMs).toBe(5 * 6000);
  });

  it('no limiter ≥40% → mixed; no gameplay or all-unknown gameplay → null', () => {
    const mixed = buildTimeSplit([
      win(0, 'gameplay', 'gpu', 100), win(1, 'gameplay', 'cpu', 100), win(2, 'gameplay', 'ambiguous', 100),
    ]);
    expect(mixed.dominant).toBe('mixed');
    expect(buildTimeSplit([win(0, 'idle', 'unknown', null)]).dominant).toBeNull();
    expect(buildTimeSplit([win(0, 'gameplay', 'unknown', null)]).dominant).toBeNull();
  });
});

describe('pickWorst', () => {
  it('picks up to 3 non-adjacent gameplay windows with a real FPS drop vs median', () => {
    const ws = [
      win(0, 'gameplay', 'gpu', 100), win(1, 'gameplay', 'gpu', 30), win(2, 'gameplay', 'gpu', 32),
      win(3, 'gameplay', 'gpu', 100), win(4, 'gameplay', 'cpu', 40), win(5, 'gameplay', 'gpu', 100),
      win(6, 'gameplay', 'gpu', 100),
    ];
    const worst = pickWorst(ws);
    expect(worst.length).toBeGreaterThan(0);
    expect(worst[0].classification.window.index).toBe(1);
    // non-adjacency: window 2 (adjacent to 1) is skipped in favor of 4
    expect(worst[1].classification.window.index).toBe(4);
    expect(worst[0].fpsDropPct).toBeGreaterThan(50);
  });

  it('a flat healthy run produces no worst moments', () => {
    const ws = [0, 1, 2, 3, 4, 5].map((i) => win(i, 'gameplay', 'gpu', 100));
    expect(pickWorst(ws)).toHaveLength(0);
  });
});

describe('buildSnapshot', () => {
  it('formats present values only, with units', () => {
    const snap = buildSnapshot(metrics({ fpsAvg: 31.2, frameTimeMs: 32.1, gpuBusyMs: 31.8, gpuUsage: 99, flagsFired: ['flag.gpu.perfLimitPower'] }));
    expect(snap).toContainEqual({ label: 'FPS', value: '31', unit: null });
    expect(snap).toContainEqual({ label: 'Frame time', value: '32.1', unit: 'ms' });
    expect(snap.find((e) => e.label === 'Flags fired')?.value).toContain('power limit');
    expect(snap.some((e) => e.label === 'VRAM dedicated')).toBe(false); // null → omitted
  });

  it('drops the frame time when it contradicts the window FPS (wrong-process PresentMon)', () => {
    const snap = buildSnapshot(metrics({ fpsAvg: 90, frameTimeMs: 20.5 }));
    expect(snap).toContainEqual({ label: 'FPS', value: '90', unit: null });
    expect(snap.some((e) => e.label === 'Frame time')).toBe(false);
  });

  it('keeps the frame time when no FPS is available to cross-check', () => {
    const snap = buildSnapshot(metrics({ frameTimeMs: 20.5 }));
    expect(snap).toContainEqual({ label: 'Frame time', value: '20.5', unit: 'ms' });
  });

  it('words the utilization-limit flag in plain language', () => {
    const snap = buildSnapshot(metrics({ flagsFired: ['flag.gpu.perfLimitUtil'] }));
    expect(snap.find((e) => e.label === 'Flags fired')?.value).toBe('GPU underutilized (waiting on CPU)');
  });
});
