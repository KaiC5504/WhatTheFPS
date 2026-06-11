import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog, makeWindow, makeWindowAnalysis } from '../causes/testkit';
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

describe('class-aware temp tiles', () => {
  it('a desktop Ryzen X3D at a 92 °C peak is over its 89 °C class limit', () => {
    const sensors = { 'cpu.tempPackage': [88, 92] };
    const log = log_with(sensors);
    log.specs = { ...log.specs, cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 7 7800X3D', isLaptop: false };
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'cpu.temp')!.severity).toBe('bad');
  });

  it('the same 92 °C peak on a mobile Ryzen (100 °C class) is only warn', () => {
    const sensors = { 'cpu.tempPackage': [88, 92] };
    const log = log_with(sensors);
    log.specs = { ...log.specs, cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 9 8940HX', isLaptop: true };
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'cpu.temp')!.severity).toBe('warn');
  });

  it('a laptop GeForce at an 88 °C peak crosses the 87 °C laptop class limit', () => {
    const sensors = { 'gpu.temp': [84, 88] };
    const log = log_with(sensors);
    log.specs = { ...log.specs, gpuVendor: 'nvidia', isLaptop: true };
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'gpu.temp')!.severity).toBe('bad');
  });

  it('unknown vendors keep the previous generic thresholds', () => {
    const sensors = { 'cpu.tempPackage': [88, 92], 'gpu.temp': [85, 86] };
    const v = buildVerdict(log_with(sensors), statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'cpu.temp')!.severity).toBe('warn'); // 90 ≤ 92 < 100
    expect(v.hero.find((h) => h.key === 'gpu.temp')!.severity).toBe('warn'); // 85 ≤ 86 < 90
  });
});

describe('time-split headline', () => {
  it('GPU-dominant', () => {
    const wa = makeWindowAnalysis([0, 1, 2, 3].map((i) => makeWindow(i, { limiter: 'gpu', metrics: { fpsAvg: 100 } })));
    const v = buildVerdict(makeLog({ fps: { source: 'displayed', series: [100] } }), {}, [], wa);
    expect(v.headline).toMatch(/GPU-bound for 100% of gameplay/);
  });
  it('CPU-dominant names the processor', () => {
    const wa = makeWindowAnalysis([0, 1, 2].map((i) => makeWindow(i, { limiter: 'cpu', metrics: { fpsAvg: 100 } })));
    const v = buildVerdict(makeLog({ fps: { source: 'displayed', series: [100] } }), {}, [], wa);
    expect(v.headline).toMatch(/CPU/);
    expect(v.headline).toMatch(/100%/);
  });
  it('capped is reassuring', () => {
    const wa = makeWindowAnalysis([0, 1, 2].map((i) => makeWindow(i, { limiter: 'capped', metrics: { fpsAvg: 120 } })));
    const log = makeLog({ fps: { source: 'displayed', series: [120], capped: true, capValue: 120 } });
    expect(buildVerdict(log, {}, [], wa).headline).toMatch(/capped at ~120/i);
  });
  it('mixed says the limit moves around', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu' }), makeWindow(1, { limiter: 'cpu' }), makeWindow(2, { limiter: 'ambiguous' }),
    ]);
    expect(buildVerdict(makeLog({ fps: { source: 'displayed', series: [1] } }), {}, [], wa).headline).toMatch(/mixed/i);
  });
  it('no gameplay + fps available → inconclusive wording, mascot concerned, guidance surfaced', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { activity: 'idle', limiter: 'unknown', tier: null })]);
    const v = buildVerdict(makeLog({ fps: { source: 'displayed', series: [100] } }), {}, [], wa);
    expect(v.headline).toMatch(/couldn.t pin down/i);
    expect(v.guidance.length).toBeGreaterThan(0);
  });
  it('benchmark logs (workload) never say gameplay', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'cpu' }), makeWindow(1, { limiter: 'cpu' }), makeWindow(2, { limiter: 'cpu' })], { activityKind: 'workload' });
    const v = buildVerdict(makeLog({}), {}, [], wa);
    expect(v.headline.toLowerCase()).not.toContain('gameplay');
  });
});

describe('primaryFix ladder', () => {
  const ev = (type: string, severity: 'info' | 'warn' | 'bad' = 'warn') =>
    ({ id: type, type, severity, sentence: `${type} happened`, fix: `fix ${type}`, sampleCount: 1 });

  it('thermal collapse outranks everything', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'gpu' })]);
    const v = buildVerdict(makeLog({}), {}, [ev('gpu-bound'), ev('thermal-collapse'), ev('vram-pressure')], wa);
    expect(v.primaryFix?.text).toContain('thermal-collapse');
  });
  it('falls back to the dominant-limiter event, then worst severity', () => {
    const wa = makeWindowAnalysis([0, 1, 2].map((i) => makeWindow(i, { limiter: 'cpu' })));
    const v = buildVerdict(makeLog({}), {}, [ev('cpu-bottleneck'), ev('ram-pressure', 'info')], wa);
    expect(v.primaryFix?.text).toContain('cpu-bottleneck');
  });
  it('null when there are no events', () => {
    const v = buildVerdict(makeLog({}), {}, [], makeWindowAnalysis([]));
    expect(v.primaryFix).toBeNull();
  });
});

describe('coverage', () => {
  it('reports gameplay vs total time', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'gpu' }), makeWindow(1, { activity: 'idle' })]);
    const v = buildVerdict(makeLog({ fps: { source: 'displayed', series: [1] } }), {}, [], wa);
    expect(v.coverage).not.toBeNull();
    expect(v.coverage!.totalMs).toBeGreaterThan(v.coverage!.gameplayMs);
  });
});

describe('temp hero tiles — average headline + secondary reading', () => {
  const tile = (sensors: Record<string, number[]>, key: string) =>
    buildVerdict(log_with(sensors), statsFor(sensors), [], makeWindowAnalysis([])).hero.find((h) => h.key === key)!;

  it('CPU tile headlines the package average and shows the all-core average as the sub', () => {
    const cpu = tile({ 'cpu.tempPackage': [76, 78, 77], 'cpu.tempCoreAvg': [64, 66, 65], 'cpu.tempCoreMax': [80, 82, 81] }, 'cpu.temp');
    expect(cpu.value).toBe('77°C');
    expect(cpu.sub).toBe('cores 65°C');
  });

  it('GPU tile headlines the edge average and shows the hotspot peak as the sub', () => {
    const gpu = tile({ 'gpu.temp': [70, 74, 72], 'gpu.hotspot': [88, 101, 95] }, 'gpu.temp');
    expect(gpu.value).toBe('72°C');
    expect(gpu.sub).toBe('hotspot 101°C');
  });

  it('colors the tile from the peak, not the displayed average (a calm avg with a hot spike still flags)', () => {
    const gpu = tile({ 'gpu.temp': [60, 92, 58] }, 'gpu.temp');
    expect(gpu.value).toBe('70°C');     // average stays calm
    expect(gpu.severity).toBe('bad');   // but the 92°C spike colors it
  });

  it('omits the sub when the secondary sensor is absent', () => {
    expect(tile({ 'cpu.tempPackage': [70, 72] }, 'cpu.temp').sub).toBeUndefined();
  });
});
