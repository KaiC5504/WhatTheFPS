import { describe, it, expect } from 'vitest';
import { slimResult } from './slim';
import { makeLog } from '../causes/testkit';
import { buildWindowAnalysis } from '../windows';
import { computeStats } from '../stats/percentiles';
import { buildVerdict } from '../verdict/buildVerdict';
import { buildDigest } from '../digest/digest';
import type { AnalysisResult, CanonicalKey, Stats } from '../types';

const ROWS = 2000;
const ramp = (base: number, amp: number) =>
  Array.from({ length: ROWS }, (_, i) => base + amp * Math.sin(i / 50));

// A deliberately fat result: ~13 sensors, a 32-series core matrix, fps series,
// a flag column and 2000 rows — the shape that blew the spec's 15 KB estimate.
function fatResult(): AnalysisResult {
  const sensors: Partial<Record<CanonicalKey, number[]>> = {
    'cpu.tempPackage': ramp(70, 10), 'cpu.tempCoreMax': ramp(75, 12), 'cpu.usageTotal': ramp(40, 20),
    'cpu.clock': ramp(4200, 300), 'cpu.power': ramp(80, 30),
    'gpu.temp': ramp(72, 8), 'gpu.hotspot': ramp(85, 10), 'gpu.usage': ramp(95, 4),
    'gpu.clock': ramp(2500, 100), 'gpu.power': ramp(120, 20),
    'ram.loadPct': ramp(60, 5), 'pm.frameTimeMs': ramp(8.3, 1), 'vram.d3dDedicatedMb': ramp(6000, 200),
  };
  const fpsSeries = ramp(120, 15);
  const log = makeLog({
    sensors,
    flags: { 'flag.gpu.perfLimitPower': Array.from({ length: ROWS }, (_, i) => i % 7 === 0) },
    fps: {
      source: 'displayed', sourceLabel: 'Framerate Displayed (avg)',
      series: fpsSeries, clean: fpsSeries, stats: computeStats(fpsSeries),
    },
  });
  log.timesMs = Array.from({ length: ROWS }, (_, i) => i * 2000);
  log.cores = {
    usage: Array.from({ length: 16 }, (_, t) => ({
      label: `Core ${t} T0`, coreType: 'std' as const, coreIndex: t, thread: 0, values: ramp(50, 30),
    })),
    effectiveClock: Array.from({ length: 16 }, (_, t) => ({
      label: `Core ${t} T0`, coreType: 'std' as const, coreIndex: t, thread: 0, values: ramp(4000, 500),
    })),
  };
  const stats: Partial<Record<CanonicalKey, Stats>> = {};
  for (const key of Object.keys(log.sensors) as CanonicalKey[]) {
    stats[key] = computeStats(log.sensors[key]!.values);
  }
  const windows = buildWindowAnalysis(log);
  const verdict = buildVerdict(log, stats, [], windows);
  const digest = buildDigest({ log, stats, events: [], windows, guidance: verdict.guidance });
  return { log, stats, events: [], verdict, digest, windows };
}

describe('slimResult', () => {
  const full = fatResult();
  const slim = slimResult(full);

  it('strips every row-aligned array but keeps sensor metadata', () => {
    expect(slim.slim).toBe(true);
    for (const s of Object.values(slim.log.sensors)) {
      expect(s!.values).toEqual([]);
      expect(s!.key.length).toBeGreaterThan(0);
    }
    expect(slim.log.sensors['gpu.temp']?.label).toBe(full.log.sensors['gpu.temp']!.label);
    expect(slim.log.fps.series).toEqual([]);
    expect(slim.log.fps.clean).toEqual([]);
    expect(slim.log.fps.stats).toEqual(full.log.fps.stats);   // scalars survive
    expect(slim.log.fps.source).toBe('displayed');
  });

  it('replaces flags with fired/total counts', () => {
    // i % 7 === 0 over 2000 rows fires 286 times
    expect(slim.log.flagCounts['flag.gpu.perfLimitPower']).toEqual({ fired: 286, total: 2000 });
  });

  it('keeps the diffable window summary and adds durationMs + logStartMs', () => {
    expect(slim.windows.timeSplit).toEqual(full.windows.timeSplit);
    expect(slim.windows.worst).toEqual(full.windows.worst);
    expect(slim.windows.activityKind).toBe(full.windows.activityKind);
    expect(slim.windows.logStartMs).toBe(full.windows.windows[0]!.window.startMs);
    expect(slim.durationMs).toBe(full.windows.timeSplit.totalMs);
    // the big per-row/per-window payloads keep their slots but carry nothing
    expect(slim.windows.windows).toEqual([]);
    expect(slim.log.timesMs).toEqual([]);
    expect(slim.log.cores).toBeNull();
  });

  it('keeps stats, events, verdict and digest verbatim', () => {
    expect(slim.stats).toEqual(full.stats);
    expect(slim.verdict).toEqual(full.verdict);
    expect(slim.digest).toEqual(full.digest);
  });

  it('fits the storage budget: ≤ 40 KB for a 2000-row log, ≥ 20× smaller than full', () => {
    const fullLen = JSON.stringify(full).length;
    const slimLen = JSON.stringify(slim).length;
    expect(slimLen).toBeLessThan(40_000);
    expect(slimLen * 20).toBeLessThan(fullLen);
  });

  it('survives a JSON round-trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(slim))).toEqual(slim);
  });
});
