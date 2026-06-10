import { describe, it, expect } from 'vitest';
import { causeRamPressure } from './ramPressure';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';
import { computeStats } from '../stats/percentiles';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

const noFrametimeWa = makeWindowAnalysis([makeWindow(0)]);

describe('causeRamPressure', () => {
  it('reports RAM pressure when load p95 is above 90% (no frametime → warn)', () => {
    const sensors = { 'ram.loadPct': [88, 92, 94, 95, 96] };
    const e = causeRamPressure(makeLog({ sensors }), statsFor(sensors), noFrametimeWa).find((x) => x.type === 'ram-pressure')!;
    expect(e.sentence.toLowerCase()).toContain('memory');
    expect(e.severity).toBe('warn');
    expect(e.fix).toBeTruthy();
  });

  it('emits nothing when memory is comfortable', () => {
    const sensors = { 'ram.loadPct': [40, 45] };
    expect(causeRamPressure(makeLog({ sensors }), statsFor(sensors), noFrametimeWa)).toEqual([]);
  });

  it('upgrades to warn when frametime spikes co-locate with high-RAM windows', () => {
    const sensors = { 'ram.loadPct': [90, 92, 94, 95, 96] };
    const wa = makeWindowAnalysis(Array.from({ length: 6 }, (_, i) => makeWindow(i, {
      metrics: { ramLoadPct: 95, frameTimeMs: 10, frameTimeMaxMs: i % 2 === 0 ? 40 : 11 },
    })));
    const e = causeRamPressure(makeLog({ sensors }), statsFor(sensors), wa).find((x) => x.type === 'ram-pressure')!;
    expect(e.severity).toBe('warn');
  });

  it('stays info when frametime data exists but no co-location', () => {
    const sensors = { 'ram.loadPct': [90, 92, 94, 95, 96] };
    const wa = makeWindowAnalysis(Array.from({ length: 6 }, (_, i) => makeWindow(i, {
      metrics: { ramLoadPct: 95, frameTimeMs: 10, frameTimeMaxMs: 11 },
    })));
    const e = causeRamPressure(makeLog({ sensors }), statsFor(sensors), wa).find((x) => x.type === 'ram-pressure')!;
    expect(e.severity).toBe('info');
  });
});
