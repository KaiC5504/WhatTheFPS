import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog } from './testkit';
import { detectCpuBottleneck } from './cpuBottleneck';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

describe('detectCpuBottleneck', () => {
  it('flags a CPU bottleneck when GPU usage is low with perf-limit-util set', () => {
    const sensors = { 'gpu.usage': [68, 70, 72, 70, 71] };
    const log = makeLog({
      sensors,
      flags: { 'flag.gpu.perfLimitUtil': [true, true, true, false, true] },
    });
    const events = detectCpuBottleneck(log, statsFor(sensors));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const e = events[0];
    expect(e.severity).toBe('warn');
    expect(e.sentence).toContain('70');     // rounded avg GPU usage
    expect(e.sentence.toLowerCase()).toContain('cpu');
    expect(e.fix).toBeTruthy();
  });

  it('does not fire when the GPU is well-utilized', () => {
    const sensors = { 'gpu.usage': [97, 98, 99, 98, 99] };
    const log = makeLog({ sensors });
    expect(detectCpuBottleneck(log, statsFor(sensors))).toEqual([]);
  });

  it('flags a single pinned core while total CPU usage stays moderate', () => {
    const sensors = {
      'gpu.usage': [97, 98, 99, 98],
      'cpu.usageTotal': [35, 38, 36, 37],
      'cpu.usageCoreMax': [99, 100, 99, 100],
    };
    const log = makeLog({ sensors });
    const events = detectCpuBottleneck(log, statsFor(sensors));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.sentence.toLowerCase().includes('core'))).toBe(true);
  });

  it('does not double-count: low GPU usage alone still yields one bottleneck event', () => {
    const sensors = { 'gpu.usage': [60, 62, 61, 63] };
    const log = makeLog({ sensors });
    const events = detectCpuBottleneck(log, statsFor(sensors));
    expect(events).toHaveLength(1);
  });
});
