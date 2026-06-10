import { describe, it, expect } from 'vitest';
import { causeCpuBound } from './cpuBound';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

const noStats = {};

describe('causeCpuBound', () => {
  it('reports a measured CPU-bound share with window evidence', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'cpu', metrics: { fpsAvg: 60 } }),
      makeWindow(1, { limiter: 'cpu', metrics: { fpsAvg: 60 } }),
      makeWindow(2, { limiter: 'gpu', metrics: { fpsAvg: 90 } }),
      makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 90 } }),
    ]);
    const events = causeCpuBound(makeLog({}), noStats, wa);
    const e = events.find((x) => x.type === 'cpu-bottleneck')!;
    expect(e.severity).toBe('warn');                       // 50% ≥ dominant threshold
    expect(e.sentence).toContain('50%');
    expect(e.evidence?.tier).toBe('measured');
    expect(e.windowIndexes).toEqual([0, 1]);
  });

  it('stays silent below the notable share', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'cpu' }),
      ...Array.from({ length: 9 }, (_, i) => makeWindow(i + 1, { limiter: 'gpu' })),
    ]);
    expect(causeCpuBound(makeLog({}), noStats, wa).some((e) => e.type === 'cpu-bottleneck')).toBe(false);
  });

  it('detects the single-thread ceiling and names the pinned thread from the core matrix', () => {
    const n = 8;
    const log = makeLog({});
    log.cores = {
      usage: [
        { label: 'P-core 2 T0', coreType: 'P', coreIndex: 2, thread: 0, values: Array(n * 4).fill(98) },
        { label: 'E-core 6 T0', coreType: 'E', coreIndex: 6, thread: 0, values: Array(n * 4).fill(20) },
      ],
      effectiveClock: [],
    };
    const wa = makeWindowAnalysis(Array.from({ length: n }, (_, i) =>
      makeWindow(i, { limiter: 'cpu', metrics: { cpuMaxThread: 98, cpuTotal: 35 } })));
    const e = causeCpuBound(log, noStats, wa).find((x) => x.type === 'cpu-bottleneck-core')!;
    expect(e.sentence).toContain('P-core 2 T0');
    expect(e.sentence).toContain('single-thread');
  });

  it('says "workload", not gameplay, for benchmark logs', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'cpu' }), makeWindow(1, { limiter: 'cpu' })], { activityKind: 'workload' });
    const e = causeCpuBound(makeLog({}), noStats, wa).find((x) => x.type === 'cpu-bottleneck')!;
    expect(e.sentence).not.toContain('gameplay');
  });
});
