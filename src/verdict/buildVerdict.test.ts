import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog, makeWindowAnalysis } from '../causes/testkit';
import { makeEvent } from '../causes/events';
import { buildVerdict } from './buildVerdict';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

describe('buildVerdict', () => {
  it('reports a healthy verdict with five hero tiles when there are no events', () => {
    const sensors = {
      'cpu.usageTotal': [40, 45, 42],
      'cpu.tempPackage': [60, 62, 61],
      'gpu.usage': [85, 88, 86],
      'gpu.temp': [65, 66, 64],
    };
    const log = makeLog({ sensors, fps: { source: 'displayed', stats: computeStats([120, 121, 119]) } });
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.health).toBe('good');
    expect(v.mascotMood).toBe('chill');
    expect(v.hero).toHaveLength(5);
    expect(v.headline).toBe('Everything looks healthy.');
    expect(v.hero.every((h) => h.severity === 'info')).toBe(true);
    expect(v.hero.find((h) => h.key === 'fps')!.value).not.toBe('—');
  });

  it('maps a bad event to bad health + panic mascot and reflects a hot GPU tile', () => {
    const sensors = {
      'cpu.usageTotal': [50, 55],
      'cpu.tempPackage': [70, 72],
      'gpu.usage': [99, 100],
      'gpu.temp': [91, 92],
    };
    const events = [
      makeEvent({ type: 'throttling', severity: 'bad', sentence: 'GPU thermal throttled in 4 samples.', fix: 'Improve cooling.', sampleCount: 4 }),
    ];
    const v = buildVerdict(log_with(sensors), statsFor(sensors), events, makeWindowAnalysis([]));
    expect(v.health).toBe('bad');
    expect(v.mascotMood).toBe('panic');
    const gpuTemp = v.hero.find((h) => h.key === 'gpu.temp')!;
    expect(gpuTemp.severity).toBe('bad'); // >=90
    expect(v.headline).toContain('GPU thermal throttled');
    expect(v.findings.length).toBeGreaterThanOrEqual(1);
    expect(v.findings[0]).toMatchObject({ severity: 'bad', text: 'GPU thermal throttled in 4 samples.', fix: 'Improve cooling.' });
  });

  it('maps a warn event to warn health + concerned mascot', () => {
    const sensors = { 'gpu.usage': [70, 71], 'gpu.temp': [86, 87] };
    const events = [makeEvent({ type: 'cpu-bottleneck', severity: 'warn', sentence: 'GPU averaged 70%.', sampleCount: 2 })];
    const v = buildVerdict(log_with(sensors), statsFor(sensors), events, makeWindowAnalysis([]));
    expect(v.health).toBe('warn');
    expect(v.mascotMood).toBe('concerned');
    expect(v.hero.find((h) => h.key === 'gpu.temp')!.severity).toBe('warn'); // >=85 <90
  });

  it('shows an em-dash FPS tile when no framerate was logged and never counts it as bad', () => {
    const sensors = { 'gpu.temp': [70, 71] };
    const log = makeLog({ sensors, fps: { source: 'none', stats: null } });
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    const fps = v.hero.find((h) => h.key === 'fps')!;
    expect(fps.value).toBe('—');
    expect(fps.severity).toBe('info');
    expect(v.health).toBe('good');
  });

  it('caps findings at four entries', () => {
    const sensors = { 'gpu.temp': [70] };
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({ type: `t${i}`, severity: 'warn', sentence: `event ${i}`, sampleCount: 1 }),
    );
    const v = buildVerdict(log_with(sensors), statsFor(sensors), events, makeWindowAnalysis([]));
    expect(v.findings.length).toBeLessThanOrEqual(4);
    expect(v.findings.length).toBeGreaterThanOrEqual(2);
  });
});

function log_with(sensors: Record<string, number[]>) {
  return makeLog({ sensors, fps: { source: 'displayed', stats: computeStats([100, 101, 99]) } });
}
