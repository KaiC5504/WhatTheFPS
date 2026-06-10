import { describe, it, expect } from 'vitest';
import { causeGpuBound } from './gpuBound';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

const gpuWin = (i: number, flags: import('../types').FlagKey[] = []) =>
  makeWindow(i, { limiter: 'gpu', metrics: { flagsFired: flags } });

describe('causeGpuBound', () => {
  it('subdivides a dominant GPU-bound share by power-limit flag density', () => {
    const wa = makeWindowAnalysis([
      gpuWin(0, ['flag.gpu.perfLimitPower']), gpuWin(1, ['flag.gpu.perfLimitPower']),
      gpuWin(2), gpuWin(3),
      makeWindow(4, { limiter: 'cpu' }),
    ]);
    const e = causeGpuBound(makeLog({}), {}, wa).find((x) => x.type === 'gpu-bound')!;
    expect(e.sentence).toContain('power limit');
    expect(e.sentence).toContain('50%');           // 2 of 4 gpu windows
    expect(e.evidence?.tier).toBe('measured');     // latched flags
  });

  it('thermal limiting outranks power and is a warn', () => {
    const wa = makeWindowAnalysis([
      gpuWin(0, ['flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitPower']),
      gpuWin(1, ['flag.gpu.perfLimitThermal']), gpuWin(2),
    ]);
    const e = causeGpuBound(makeLog({}), {}, wa).find((x) => x.type === 'gpu-bound')!;
    expect(e.severity).toBe('warn');
    expect(e.sentence.toLowerCase()).toContain('thermal');
  });

  it('plain compute-bound gets an info event with no limiter claim', () => {
    const wa = makeWindowAnalysis([gpuWin(0), gpuWin(1), gpuWin(2)]);
    const e = causeGpuBound(makeLog({}), {}, wa).find((x) => x.type === 'gpu-bound')!;
    expect(e.severity).toBe('info');
  });

  it('reports the underutilized pathology', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'underutilized' }), makeWindow(1, { limiter: 'underutilized' }),
      makeWindow(2, { limiter: 'gpu' }), makeWindow(3, { limiter: 'gpu' }),
    ]);
    const e = causeGpuBound(makeLog({}), {}, wa).find((x) => x.type === 'gpu-underutilized')!;
    expect(e.severity).toBe('warn');
    expect(e.sentence).toContain('driver');
  });

  it('non-dominant GPU share emits nothing', () => {
    const wa = makeWindowAnalysis([gpuWin(0), makeWindow(1, { limiter: 'cpu' }), makeWindow(2, { limiter: 'cpu' }), makeWindow(3, { limiter: 'cpu' })]);
    expect(causeGpuBound(makeLog({}), {}, wa).some((e) => e.type === 'gpu-bound')).toBe(false);
  });
});
