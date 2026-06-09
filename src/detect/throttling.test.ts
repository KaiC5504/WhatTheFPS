import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog } from './testkit';
import { detectThrottling } from './throttling';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

describe('detectThrottling', () => {
  it('fires on a sustained CPU thermal-throttle flag, naming count and peak temp', () => {
    const sensors = { 'cpu.tempCoreMax': [88, 99, 99, 99] };
    const log = makeLog({
      sensors,
      flags: { 'flag.cpu.thermalThrottle': [false, true, true, true] },
    });
    const events = detectThrottling(log, statsFor(sensors));
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.severity).toBe('bad');
    expect(e.sentence).toContain('3');     // 3 throttled samples
    expect(e.sentence).toContain('99');    // peak temp
    expect(e.fix).toBeTruthy();
    expect(e.sampleCount).toBe(3);
  });

  it('treats a single isolated throttle sample as a warn, not bad', () => {
    const sensors = { 'cpu.tempCoreMax': [70, 95, 70, 70] };
    const log = makeLog({
      sensors,
      flags: { 'flag.cpu.prochot': [false, true, false, false] },
    });
    const events = detectThrottling(log, statsFor(sensors));
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('warn');
    expect(events[0].sampleCount).toBe(1);
  });

  it('returns no events when no throttle flags fire', () => {
    const sensors = { 'cpu.tempCoreMax': [60, 62, 61, 63] };
    const log = makeLog({
      sensors,
      flags: { 'flag.cpu.thermalThrottle': [false, false, false, false] },
    });
    expect(detectThrottling(log, statsFor(sensors))).toEqual([]);
  });

  it('detects GPU throttling via a clock drop while GPU temp is near its max', () => {
    const sensors = {
      'gpu.temp': [83, 84, 84, 84, 84],
      'gpu.clock': [2700, 2700, 2400, 2350, 2300],
    };
    const log = makeLog({ sensors });
    const events = detectThrottling(log, statsFor(sensors));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.sentence.toLowerCase().includes('gpu'))).toBe(true);
  });
});
