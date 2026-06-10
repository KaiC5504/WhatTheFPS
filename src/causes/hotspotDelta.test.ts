import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';
import { causeHotspotDelta } from './hotspotDelta';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

const wa = makeWindowAnalysis([makeWindow(0)]);

describe('causeHotspotDelta', () => {
  it('reports a high power-limit hit rate with measured evidence', () => {
    const log = makeLog({ flags: { 'flag.gpu.perfLimitPower': [true, true, true, true, false] } });
    const e = causeHotspotDelta(log, {}, wa).find((x) => x.type === 'power-limit')!;
    expect(e.sentence.toLowerCase()).toContain('power limit');
    expect(e.sentence).toContain('80'); // 4/5 = 80%
    expect(e.evidence?.tier).toBe('measured');
  });

  it('reports a large hotspot-to-core temperature delta', () => {
    const sensors = { 'gpu.temp': [60, 61, 60, 62], 'gpu.hotspot': [82, 84, 81, 85] };
    const log = makeLog({ sensors });
    const e = causeHotspotDelta(log, statsFor(sensors), wa).find((x) => x.type === 'hotspot-delta')!;
    expect(e.severity).toBe('warn');
    expect(e.sentence.toLowerCase()).toMatch(/hotspot|hot spot/);
    expect(e.fix!.toLowerCase()).toMatch(/repaste|pad/);
  });

  it('does not report hotspot delta when it is within normal range', () => {
    const sensors = { 'gpu.temp': [60, 61, 60, 62], 'gpu.hotspot': [70, 71, 70, 72] };
    const log = makeLog({ sensors });
    expect(causeHotspotDelta(log, statsFor(sensors), wa).find((x) => x.type === 'hotspot-delta')).toBeUndefined();
  });

  it('emits nothing when everything is comfortable', () => {
    const sensors = { 'gpu.temp': [60, 61], 'gpu.hotspot': [70, 71] };
    const log = makeLog({ sensors, flags: { 'flag.gpu.perfLimitPower': [false, false] } });
    expect(causeHotspotDelta(log, statsFor(sensors), wa)).toEqual([]);
  });
});
