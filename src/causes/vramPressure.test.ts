import { describe, it, expect } from 'vitest';
import { causeVramPressure } from './vramPressure';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';
import { computeStats } from '../stats/percentiles';
import type { CanonicalKey, Stats } from '../types';

function fullVramLog(rows: number) {
  return makeLog({ sensors: {
    'vram.allocatedMb': Array(rows).fill(7900),
    'vram.availableMb': Array(rows).fill(292),      // capacity ≈ 8192
    'vram.d3dDedicatedMb': Array(rows).fill(7800),  // p95 ≥ 90% capacity
    'vram.d3dDynamicMb': Array.from({ length: rows }, (_, i) => 200 + i * 10), // rising spill
  } });
}
function statsFor(log: ReturnType<typeof makeLog>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, s] of Object.entries(log.sensors)) out[k as CanonicalKey] = computeStats(s!.values);
  return out;
}

describe('causeVramPressure', () => {
  it('fires when dedicated ≈ capacity, spill rises and frametime spikes co-locate', () => {
    const log = fullVramLog(64);
    const wa = makeWindowAnalysis(Array.from({ length: 16 }, (_, i) => makeWindow(i, {
      metrics: { vramDedicatedMb: 7800, vramDynamicMb: 200 + i * 30, frameTimeMs: 10, frameTimeMaxMs: i % 4 === 0 ? 40 : 11 },
    })));
    const e = causeVramPressure(log, statsFor(log), wa).find((x) => x.type === 'vram-pressure')!;
    expect(e.severity).toBe('warn');
    expect(e.sentence).toMatch(/headroom/i);
  });

  it('without frametime data it reports near-full VRAM as unconfirmed + guidance', () => {
    const log = fullVramLog(64);
    const wa = makeWindowAnalysis(Array.from({ length: 16 }, (_, i) => makeWindow(i, {
      metrics: { vramDedicatedMb: 7900 },
    })));
    const e = causeVramPressure(log, statsFor(log), wa).find((x) => x.type === 'vram-pressure')!;
    expect(e.severity).toBe('info');
    expect(e.evidence?.missing?.length).toBeGreaterThan(0);
  });

  it('stays silent with plenty of headroom', () => {
    const log = makeLog({ sensors: {
      'vram.allocatedMb': Array(8).fill(4000), 'vram.availableMb': Array(8).fill(4192),
      'vram.d3dDedicatedMb': Array(8).fill(3900), 'vram.d3dDynamicMb': Array(8).fill(150),
    } });
    const wa = makeWindowAnalysis([makeWindow(0)]);
    expect(causeVramPressure(log, statsFor(log), wa)).toHaveLength(0);
  });
});
