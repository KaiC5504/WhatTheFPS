import { describe, it, expect } from 'vitest';
import { buildCompareDigest } from './compareDigest';
import { compareRuns } from '../compare/diff';
import { makeSlim, makeSavedRun, stat } from '../compare/testkit';

const before = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 80, max: 87 }) },
  fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg: 112, p1Low: 70 }) },
  digest: { compact: 'BEFORE COMPACT BODY\n\nGoal: old before goal', full: 'BEFORE FULL BODY\n\nGoal: old before goal' },
});
const after = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 72, max: 78 }) },
  fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg: 118, p1Low: 76 }) },
  digest: { compact: 'AFTER COMPACT BODY\n\nGoal: old after goal', full: 'AFTER FULL BODY\n\nGoal: old after goal' },
});
const runB = makeSavedRun(before, { id: 'b', name: 'stock', createdAt: Date.UTC(2026, 5, 10, 20, 0) });
const runA = makeSavedRun(after, { id: 'a', name: 'undervolt', createdAt: Date.UTC(2026, 5, 11, 20, 0) });
const comparison = compareRuns(before, after);

describe('buildCompareDigest', () => {
  const digest = buildCompareDigest(runB, runA, comparison);

  it('stacks both stored digests under labeled headers, per mode', () => {
    expect(digest.compact).toContain('=== BEFORE: stock ===');
    expect(digest.compact).toContain('BEFORE COMPACT BODY');
    expect(digest.compact).toContain('=== AFTER: undervolt ===');
    expect(digest.compact).toContain('AFTER COMPACT BODY');
    expect(digest.full).toContain('BEFORE FULL BODY');
    expect(digest.full).toContain('AFTER FULL BODY');
    expect(digest.full).not.toContain('COMPACT BODY');
  });

  it('opens with the delta summary: headline, hero deltas, events, time split, caveats', () => {
    expect(digest.compact).toContain('HWiNFO before/after comparison:');
    expect(digest.compact).toContain(comparison.headline);
    expect(digest.compact).toContain('GPU temp: 80°C → 72°C (-8°C) [better]');
    expect(digest.compact).toContain('Events:');
    expect(digest.compact).toContain('Time split');
    expect(digest.compact).toContain('confirm both runs were the same workload');
  });

  it('the compare goal replaces the per-run goals: exactly one Goal line, at the end', () => {
    expect((digest.compact.match(/^Goal: /gm) ?? []).length).toBe(1);
    expect(digest.compact.trimEnd()).toMatch(/Goal: did this change help, and what else can I tune\?$/);
    const custom = buildCompareDigest(runB, runA, comparison, { goal: 'is my undervolt stable?' });
    expect(custom.compact.trimEnd()).toMatch(/Goal: is my undervolt stable\?$/);
    expect(custom.compact).not.toContain('old before goal');
  });

  it('full mode also lists every significant sensor delta', () => {
    expect(digest.full).toContain('All significant deltas:');
    expect(digest.full).toContain('FPS 1% low');
    expect(digest.compact).not.toContain('All significant deltas:');
  });

  it('renders missing sides as — and never NaN', () => {
    const oneSided = compareRuns(before, makeSlim());
    const d = buildCompareDigest(runB, makeSavedRun(makeSlim(), { name: 'empty' }), oneSided);
    expect(d.compact).toContain('—');
    expect(d.compact).not.toContain('NaN');
  });

  it('token estimate is length/4 per mode and the fps source label carries over', () => {
    expect(digest.tokenEstimate.compact).toBe(Math.ceil(digest.compact.length / 4));
    expect(digest.tokenEstimate.full).toBe(Math.ceil(digest.full.length / 4));
    expect(digest.fpsSourceLabel).toBe(after.digest.fpsSourceLabel);
  });
});
