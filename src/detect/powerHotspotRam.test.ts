import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog } from './testkit';
import { detectPowerHotspotRam } from './powerHotspotRam';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

describe('detectPowerHotspotRam', () => {
  it('reports a high power-limit hit rate', () => {
    const log = makeLog({
      sensors: {},
      flags: { 'flag.gpu.perfLimitPower': [true, true, true, true, false] },
    });
    const events = detectPowerHotspotRam(log, {});
    const e = events.find((x) => x.type === 'power-limit');
    expect(e).toBeDefined();
    expect(e!.sentence.toLowerCase()).toContain('power limit');
    expect(e!.sentence).toContain('80'); // 4/5 = 80%
  });

  it('reports a large hotspot-to-core temperature delta', () => {
    const sensors = {
      'gpu.temp': [60, 61, 60, 62],
      'gpu.hotspot': [82, 84, 81, 85],
    };
    const log = makeLog({ sensors });
    const events = detectPowerHotspotRam(log, statsFor(sensors));
    const e = events.find((x) => x.type === 'hotspot-delta');
    expect(e).toBeDefined();
    expect(e!.severity).toBe('warn');
    expect(e!.sentence.toLowerCase()).toMatch(/hotspot|hot spot/);
    expect(e!.fix!.toLowerCase()).toMatch(/repaste|pad/);
  });

  it('does not report hotspot delta when it is within normal range', () => {
    const sensors = {
      'gpu.temp': [60, 61, 60, 62],
      'gpu.hotspot': [70, 71, 70, 72],
    };
    const log = makeLog({ sensors });
    const events = detectPowerHotspotRam(log, statsFor(sensors));
    expect(events.find((x) => x.type === 'hotspot-delta')).toBeUndefined();
  });

  it('reports RAM pressure when load p95 is above 90%', () => {
    const sensors = { 'ram.loadPct': [88, 92, 94, 95, 96] };
    const log = makeLog({ sensors });
    const events = detectPowerHotspotRam(log, statsFor(sensors));
    const e = events.find((x) => x.type === 'ram-pressure');
    expect(e).toBeDefined();
    expect(e!.sentence.toLowerCase()).toContain('memory');
    expect(e!.fix).toBeTruthy();
  });

  it('emits nothing when everything is comfortable', () => {
    const sensors = {
      'gpu.temp': [60, 61],
      'gpu.hotspot': [70, 71],
      'ram.loadPct': [40, 45],
    };
    const log = makeLog({ sensors, flags: { 'flag.gpu.perfLimitPower': [false, false] } });
    expect(detectPowerHotspotRam(log, statsFor(sensors))).toEqual([]);
  });
});
