import { describe, it, expect } from 'vitest';
import { causeThermalCollapse } from './thermalCollapse';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

// 16 gameplay windows spanning >4 min where FPS and GPU effective clock sag together
// while GPU temp climbs to its session max.
function collapsingWa() {
  return makeWindowAnalysis(Array.from({ length: 16 }, (_, i) => makeWindow(i, {
    limiter: 'gpu',
    durMs: 30_000,
    metrics: {
      fpsAvg: 120 - i * 2.5,            // 120 → 82.5 (late/early ≈ 0.73)
      gpuClockEffMhz: 2600 - i * 20,    // 2600 → 2300 (ratio ≈ 0.90)
      gpuTempC: 70 + i,                 // late epoch within 3°C of max
    },
  })));
}

describe('causeThermalCollapse', () => {
  it('detects heat-soak collapse with epoch numbers in the sentence', () => {
    const e = causeThermalCollapse(makeLog({}), {}, collapsingWa()).find((x) => x.type === 'thermal-collapse')!;
    expect(e.severity).toBe('warn');
    expect(e.sentence).toMatch(/FPS fell \d+%/);
    expect(e.sentence.toLowerCase()).toContain('gpu');
  });

  it('rejects a bimodal log (two areas, no consistent decline)', () => {
    const wa = makeWindowAnalysis(Array.from({ length: 16 }, (_, i) => makeWindow(i, {
      limiter: 'gpu', durMs: 30_000,
      metrics: { fpsAvg: i % 2 ? 120 : 80, gpuClockEffMhz: i % 2 ? 2600 : 2300, gpuTempC: 75 },
    })));
    expect(causeThermalCollapse(makeLog({}), {}, wa).some((x) => x.type === 'thermal-collapse')).toBe(false);
  });

  it('skips short sessions', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { metrics: { fpsAvg: 100 } }), makeWindow(1, { metrics: { fpsAvg: 60 } })]);
    expect(causeThermalCollapse(makeLog({}), {}, wa).some((x) => x.type === 'thermal-collapse')).toBe(false);
  });

  it('still reports raw CPU throttle-flag counts (re-homed from detect/throttling)', () => {
    const log = makeLog({
      flags: { 'flag.cpu.thermalThrottle': [false, true, true] },
      sensors: { 'cpu.tempCoreMax': [80, 99, 100] },
    });
    const stats = { 'cpu.tempCoreMax': { count: 3, avg: 93, min: 80, max: 100, p5: 80, p95: 100, p99: 100, p1Low: 80, p5Low: 80 } };
    const wa = makeWindowAnalysis([makeWindow(0)]);
    const e = causeThermalCollapse(log, stats, wa).find((x) => x.type === 'throttling')!;
    expect(e.sentence).toContain('thermal throttling');
    expect(e.sentence).toContain('100°C');
    expect(e.evidence?.tier).toBe('measured');
  });
});

describe('causeThermalCollapse — re-homed flag reporting', () => {
  const wa = makeWindowAnalysis([makeWindow(0)]);
  function statsFor(sensors: Record<string, number[]>) {
    const out: Record<string, import('../types').Stats> = {};
    for (const [k, v] of Object.entries(sensors)) {
      const sorted = [...v].sort((a, b) => a - b);
      out[k] = { count: v.length, avg: v.reduce((s, n) => s + n, 0) / v.length, min: sorted[0], max: sorted[sorted.length - 1], p5: sorted[0], p95: sorted[sorted.length - 1], p99: sorted[sorted.length - 1], p1Low: sorted[0], p5Low: sorted[0] };
    }
    return out as Partial<Record<import('../types').CanonicalKey, import('../types').Stats>>;
  }

  it('fires bad on a sustained CPU thermal-throttle flag, naming count and peak temp', () => {
    const sensors = { 'cpu.tempCoreMax': [88, 99, 99, 99] };
    const log = makeLog({ sensors, flags: { 'flag.cpu.thermalThrottle': [false, true, true, true] } });
    const e = causeThermalCollapse(log, statsFor(sensors), wa).find((x) => x.type === 'throttling')!;
    expect(e.severity).toBe('bad');
    expect(e.sentence).toContain('3');
    expect(e.sentence).toContain('99');
    expect(e.sampleCount).toBe(3);
  });

  it('treats a single isolated throttle sample as a warn, not bad', () => {
    const sensors = { 'cpu.tempCoreMax': [70, 95, 70, 70] };
    const log = makeLog({ sensors, flags: { 'flag.cpu.prochot': [false, true, false, false] } });
    const e = causeThermalCollapse(log, statsFor(sensors), wa).find((x) => x.type === 'throttling')!;
    expect(e.severity).toBe('warn');
    expect(e.sampleCount).toBe(1);
  });

  it('reports no throttling events when no throttle flags fire', () => {
    const sensors = { 'cpu.tempCoreMax': [60, 62, 61, 63] };
    const log = makeLog({ sensors, flags: { 'flag.cpu.thermalThrottle': [false, false, false, false] } });
    expect(causeThermalCollapse(log, statsFor(sensors), wa).some((x) => x.type === 'throttling')).toBe(false);
  });
});

// NVIDIA's "Performance Limit - Thermal" is a soft clock-cap reason that latches briefly even on
// a cool card — unlike a CPU hardware-protection throttle. It must be judged by how much of the
// session it covered, and the edge temp (not the always-hotter hotspot) is the headline number.
describe('causeThermalCollapse — GPU thermal-limit (perf-cap reason)', () => {
  const wa = makeWindowAnalysis([makeWindow(0)]);
  function statsFor(sensors: Record<string, number[]>) {
    const out: Record<string, import('../types').Stats> = {};
    for (const [k, v] of Object.entries(sensors)) {
      const sorted = [...v].sort((a, b) => a - b);
      out[k] = { count: v.length, avg: v.reduce((s, n) => s + n, 0) / v.length, min: sorted[0], max: sorted[sorted.length - 1], p5: sorted[0], p95: sorted[sorted.length - 1], p99: sorted[sorted.length - 1], p1Low: sorted[0], p5Low: sorted[0] };
    }
    return out as Partial<Record<import('../types').CanonicalKey, import('../types').Stats>>;
  }
  const flagArray = (trueCount: number, total: number) => Array.from({ length: total }, (_, i) => i < trueCount);

  it('suppresses a transient thermal-cap blip (0.6% of the session — measurement noise)', () => {
    const log = makeLog({ flags: { 'flag.gpu.perfLimitThermal': flagArray(13, 2175) }, sensors: { 'gpu.temp': [70, 86], 'gpu.hotspot': [80, 101] } });
    const events = causeThermalCollapse(log, statsFor({ 'gpu.temp': [70, 86], 'gpu.hotspot': [80, 101] }), wa);
    expect(events.some((e) => e.type === 'throttling')).toBe(false);
  });

  it('reports the edge temp as the peak and labels the hotspot — never the bare hotspot', () => {
    const sensors = { 'gpu.temp': [70, 86], 'gpu.hotspot': [80, 101] };
    const log = makeLog({ flags: { 'flag.gpu.perfLimitThermal': flagArray(13, 20) }, sensors });
    const e = causeThermalCollapse(log, statsFor(sensors), wa).find((x) => x.type === 'throttling')!;
    expect(e.sentence).toContain('86°C');           // GPU edge temp peak (what the user sees in MSI)
    expect(e.sentence).toContain('hotspot 101°C');  // hotspot present but explicitly labeled
    expect(e.sentence).not.toMatch(/\(peak 101°C\)/); // the old misleading bare peak is gone
  });

  it('fires at most a warn for sustained thermal limiting — never bad', () => {
    const sensors = { 'gpu.temp': [70, 86] };
    const log = makeLog({ flags: { 'flag.gpu.perfLimitThermal': flagArray(18, 20) }, sensors }); // 90%
    const e = causeThermalCollapse(log, statsFor(sensors), wa).find((x) => x.type === 'throttling')!;
    expect(e.severity).toBe('warn');
  });

  it('treats a present-but-minor amount of thermal limiting as a calm info note', () => {
    const sensors = { 'gpu.temp': [70, 86] };
    const log = makeLog({ flags: { 'flag.gpu.perfLimitThermal': flagArray(2, 20) }, sensors }); // 10%
    const e = causeThermalCollapse(log, statsFor(sensors), wa).find((x) => x.type === 'throttling')!;
    expect(e.severity).toBe('info');
  });
});

describe('causeThermalCollapse — compare subtypes', () => {
  it('tags CPU flag events cpu-thermal and the GPU limit event gpu-thermal', () => {
    const log = makeLog({
      flags: {
        'flag.cpu.thermalThrottle': [false, true, true],
        'flag.gpu.perfLimitThermal': [true, true, false],   // 67% density → fires
      },
      sensors: { 'cpu.tempCoreMax': [80, 99, 100], 'gpu.temp': [70, 86, 84] },
    });
    const wa = makeWindowAnalysis([makeWindow(0)]);
    const events = causeThermalCollapse(log, {}, wa);
    expect(events.find((e) => e.sentence.startsWith('CPU'))?.subtype).toBe('cpu-thermal');
    expect(events.find((e) => e.sentence.startsWith('GPU'))?.subtype).toBe('gpu-thermal');
  });

  it('tags the heat-soak collapse with the sagging side', () => {
    const e = causeThermalCollapse(makeLog({}), {}, collapsingWa()).find((x) => x.type === 'thermal-collapse')!;
    expect(e.subtype).toBe('gpu-thermal');
  });
});
