import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog } from './testkit';
import { detectFpsCap } from './fpsCap';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

describe('detectFpsCap', () => {
  it('suggests undervolting when FPS is capped and there is thermal/power headroom', () => {
    const sensors = { 'gpu.usage': [55, 60, 58, 57], 'gpu.temp': [62, 63, 62, 64] };
    const log = makeLog({
      sensors,
      fps: { source: 'displayed', capped: true, capValue: 60 },
    });
    const events = detectFpsCap(log, statsFor(sensors));
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.severity).toBe('info');
    expect(e.sentence).toContain('60');
    expect(e.sentence.toLowerCase()).toContain('headroom');
    expect(e.fix).toBeTruthy();
    expect(e.fix!.toLowerCase()).toMatch(/undervolt|power limit/);
  });

  it('does not claim headroom when the GPU is thermally limited even though capped', () => {
    const sensors = { 'gpu.usage': [55, 60, 58, 57], 'gpu.temp': [83, 84, 84, 84] };
    const log = makeLog({
      sensors,
      flags: { 'flag.gpu.perfLimitThermal': [true, true, true, true] },
      fps: { source: 'displayed', capped: true, capValue: 60 },
    });
    const events = detectFpsCap(log, statsFor(sensors));
    if (events.length > 0) {
      expect(events[0].sentence.toLowerCase()).not.toContain('headroom');
    }
  });

  it('emits nothing when FPS is not capped', () => {
    const sensors = { 'gpu.usage': [98, 99, 99, 100] };
    const log = makeLog({ sensors, fps: { source: 'displayed', capped: false, capValue: null } });
    expect(detectFpsCap(log, statsFor(sensors))).toEqual([]);
  });

  it('does not suggest headroom when the GPU is pinned at ~100%', () => {
    const sensors = { 'gpu.usage': [99, 100, 99, 100], 'gpu.temp': [60, 61, 60, 62] };
    const log = makeLog({ sensors, fps: { source: 'displayed', capped: true, capValue: 144 } });
    const events = detectFpsCap(log, statsFor(sensors));
    if (events.length > 0) {
      expect(events[0].sentence.toLowerCase()).not.toContain('headroom');
    }
  });
});
