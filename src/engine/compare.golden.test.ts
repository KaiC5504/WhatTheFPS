import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from './analyze';
import { slimResult } from '../compare/slim';
import { compareRuns } from '../compare/diff';
import { buildCompareDigest } from '../digest/compareDigest';
import type { SavedRun, SlimResult } from '../types';

const sample = (rel: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), 'HWINFO samples', rel)));
const asRun = (id: string, name: string, createdAt: number, result: SlimResult): SavedRun =>
  ({ id, name, createdAt, result });

describe('compare (golden, real same-machine logs)', () => {
  const before = slimResult(analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV')));
  const after = slimResult(analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_0.9_2520MHz.CSV')));
  const c = compareRuns(before, after);

  it('same machine: no cpu/gpu mismatch; the workload caveat is still there', () => {
    expect(c.mismatches.every((m) => m.kind !== 'cpu' && m.kind !== 'gpu')).toBe(true);
    expect(c.caveat).toContain('same workload');
  });

  it('five hero rows with real numbers on both sides; every delta finite', () => {
    expect(c.heroDeltas).toHaveLength(5);
    const fps = c.heroDeltas[0];
    expect(fps.before).not.toBeNull();
    expect(fps.after).not.toBeNull();
    for (const d of [...c.heroDeltas, ...c.sensorDeltas]) {
      for (const v of [d.before, d.after, d.delta]) {
        if (v !== null) expect(Number.isFinite(v), `${d.key}/${d.stat}`).toBe(true);
      }
    }
  });

  it('deltas are sane and the headline says something', () => {
    const gpu = c.heroDeltas.find((d) => d.key === 'gpu.temp')!;
    expect(Math.abs(gpu.delta ?? 0)).toBeLessThan(20);
    expect(c.headline.length).toBeGreaterThan(0);
    expect(c.timeSplitDelta.before.dominant).toBe('gpu');
  });

  it('the compare digest stacks both runs, one Goal line, no NaN', () => {
    const digest = buildCompareDigest(
      asRun('b', 'stock 2460', 1, before),
      asRun('a', '0.9 V undervolt', 2, after),
      c,
    );
    expect(digest.full).toContain('=== BEFORE: stock 2460 ===');
    expect(digest.full).toContain('=== AFTER: 0.9 V undervolt ===');
    expect(digest.full).not.toContain('NaN');
    expect(digest.compact).not.toContain('NaN');
    expect((digest.full.match(/^Goal: /gm) ?? []).length).toBe(1);
  });
});
