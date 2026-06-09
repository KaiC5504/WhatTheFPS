import { describe, it, expect } from 'vitest';
import { analyze } from './analyze';

// Exercises decode → parseCsv → buildColumns → normalize → buildFps → stats →
// detectors → verdict → digest end to end on a tiny in-memory CSV.
const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');

describe('analyze (unit)', () => {
  const result = analyze(new TextEncoder().encode(tinyCsv));

  it('returns a populated AnalysisResult', () => {
    expect(result.verdict.hero).toHaveLength(5);
    expect(result.digest.compact.length).toBeGreaterThan(0);
  });

  it('wires the FPS pipeline (normalize leaves a none-placeholder)', () => {
    expect(result.log.fps.source).toBe('displayed');
    expect(result.log.fps.stats?.avg).toBeCloseTo(119, 0);
  });

  it('computes per-sensor stats keyed by CanonicalKey', () => {
    expect(result.stats['cpu.usageTotal']?.avg).toBe(50);
    expect(result.stats['gpu.temp']?.max).toBe(77);
  });

  it('never emits a NaN hero value', () => {
    for (const tile of result.verdict.hero) expect(tile.value).not.toContain('NaN');
  });
});
