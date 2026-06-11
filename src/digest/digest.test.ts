import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog, makeWindow, makeWindowAnalysis } from '../causes/testkit';
import { makeEvent } from '../causes/events';
import { buildDigest } from './digest';
import type { CanonicalKey, Stats } from '../types';

function statsFor(sensors: Record<string, number[]>): Partial<Record<CanonicalKey, Stats>> {
  const out: Partial<Record<CanonicalKey, Stats>> = {};
  for (const [k, v] of Object.entries(sensors)) out[k as CanonicalKey] = computeStats(v);
  return out;
}

function sampleResult() {
  const sensors = {
    'cpu.tempPackage': [70, 72, 71, 73, 74],
    'cpu.usageTotal': [40, 42, 41, 43, 44],
    'gpu.temp': [80, 82, 81, 83, 84],
    'gpu.clock': [2600, 2610, 2605, 2615, 2620],
    'gpu.usage': [95, 96, 97, 96, 98],
  };
  const log = makeLog({
    sensors,
    fps: {
      source: 'displayed',
      sourceLabel: 'Framerate Displayed (avg)',
      stats: computeStats([120, 118, 122, 119, 121]),
      displayedAvg: 120,
      presentedAvg: 125,
    },
  });
  log.specs = { ...log.specs, cpuVendor: 'intel', cpuModelGuess: 'Intel hybrid (6P+8E)', gpuVendor: 'nvidia', gpuModelGuess: 'NVIDIA dGPU', ramMb: 32768 };
  const events = [
    makeEvent({ type: 'cpu-bottleneck', severity: 'warn', sentence: 'GPU averaged 96% usage.', fix: 'A faster CPU can help.', sampleCount: 5 }),
  ];
  return { log, stats: statsFor(sensors), events, windows: makeWindowAnalysis([]), guidance: [] };
}

describe('buildDigest', () => {
  it('produces a stable compact digest', () => {
    const d = buildDigest(sampleResult());
    expect(d.compact).toMatchInlineSnapshot(`
      "HWiNFO session summary (compact):

      System (inferred, edit if wrong):
      - CPU: Intel hybrid (6P+8E)
      - GPU: NVIDIA dGPU
      - RAM: 32 GB
      - Form factor: desktop

      Sensors:
      - CPU temp: avg 72 °C, p95 73.8 °C, p99 74.0 °C, max 74 °C
      - GPU temp: avg 82 °C, p95 83.8 °C, p99 84.0 °C, max 84 °C
      - GPU clock: avg 2610 MHz, p95 2619 MHz, p99 2619.8 MHz, max 2620 MHz
      - CPU usage: avg 42%, 1% low 40%, 5% low 40%
      - GPU usage: avg 96.4%, 1% low 95%, 5% low 95%
      - FPS (source: Framerate Displayed (avg)): avg 120, 1% low 118, 5% low 118

      Detected events:
      - [warn] GPU averaged 96% usage.

      Context (fill in for better advice):
      - Game, settings & resolution:
      - Power profile & cooling (performance mode, cooling pad, plugged in):

      Goal: help me lower temps without losing FPS"
    `);
  });

  it('labels the FPS source line and includes percentile + low lines and the events + goal', () => {
    const d = buildDigest(sampleResult());
    expect(d.compact).toContain('FPS (source: Framerate Displayed (avg))');
    expect(d.compact).toMatch(/GPU temp.*p95.*p99.*max/);
    expect(d.compact).toMatch(/FPS.*1% low/);
    expect(d.compact.toLowerCase()).toContain('detected events');
    expect(d.compact).toContain('GPU averaged 96% usage.');
    expect(d.compact).toContain('help me lower temps without losing FPS');
  });

  it('uses a custom goal when provided', () => {
    const d = buildDigest({ ...sampleResult(), goal: 'maximize FPS for esports' });
    expect(d.compact).toContain('maximize FPS for esports');
    expect(d.compact).not.toContain('help me lower temps without losing FPS');
  });

  it('never leaks raw CSV rows or timestamps', () => {
    const d = buildDigest(sampleResult());
    expect(d.compact).not.toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/); // no D.M.YYYY date
    expect(d.compact).not.toMatch(/\d{2}:\d{2}:\d{2}/);       // no HH:MM:SS time
    expect(d.full).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('full digest is longer and costs more tokens than compact', () => {
    const d = buildDigest(sampleResult());
    expect(d.tokenEstimate.compact).toBe(Math.ceil(d.compact.length / 4));
    expect(d.tokenEstimate.full).toBe(Math.ceil(d.full.length / 4));
    expect(d.tokenEstimate.compact).toBeLessThan(d.tokenEstimate.full);
  });

  it('full digest exposes the presented-vs-displayed FPS split', () => {
    const d = buildDigest(sampleResult());
    expect(d.full.toLowerCase()).toContain('presented');
    expect(d.full.toLowerCase()).toContain('displayed');
  });

  it('renders fan speeds in compact and voltages in full with mV precision', () => {
    const base = sampleResult();
    const stats = { ...base.stats, ...statsFor({
      'fan.cpuRpm': [3200, 3400, 3300, 3500, 3600],
      'fan.gpuRpm': [2800, 2900, 2850, 2950, 3000],
      'gpu.coreVoltage': [0.875, 0.9, 0.88, 0.92, 0.91],
      'cpu.coreVoltage': [1.15, 1.2, 1.18, 1.22, 1.25],
    }) };
    const d = buildDigest({ ...base, stats });
    expect(d.compact).toMatch(/CPU fan \(max\): avg \d+ RPM, p95 \d+ RPM, p99 \d+ RPM, max 3600 RPM/);
    expect(d.compact).toMatch(/GPU fan \(max\): avg \d+ RPM.*max 3000 RPM/);
    expect(d.full).toMatch(/GPU core voltage: avg 0\.897 V.*max 0\.920 V/);
    expect(d.full).toMatch(/CPU core voltage: avg 1\.200 V/);
    expect(d.compact).not.toMatch(/core voltage/);
  });

  it('renders "no framerate logged" when there is no FPS source', () => {
    const sensors = { 'gpu.temp': [70, 71, 72] };
    const log = makeLog({ sensors, fps: { source: 'none', sourceLabel: '', stats: null } });
    const d = buildDigest({ log, stats: statsFor(sensors), events: [], windows: makeWindowAnalysis([]), guidance: [] });
    expect(d.compact).toContain('no framerate logged');
    expect(d.fpsSourceLabel).toBe('');
  });

  it('full digest includes worst-drive and VRM temp rows when present, compact does not', () => {
    const base = sampleResult();
    const extra = { 'drive.tempC': [45, 52, 70, 68, 66], 'vrm.tempC': [60, 64, 70, 72, 71] };
    const d = buildDigest({ ...base, stats: { ...base.stats, ...statsFor(extra) } });
    expect(d.full).toMatch(/Drive temp \(worst\): avg .*max 70/);
    expect(d.full).toMatch(/CPU VRM temp \(worst rail\)/);
    expect(d.compact).not.toMatch(/Drive temp/);
  });

  it('full digest carries one class-level typical-range line; compact stays lean', () => {
    const d = buildDigest(sampleResult());
    expect(d.full).toContain('Typical for this class of hardware:');
    expect(d.full).toMatch(/CPU load temps under \d+ °C are typical/);
    expect(d.full).toMatch(/GPU edge under \d+ °C is typical/);
    expect(d.compact).not.toContain('Typical for this class of hardware:');
  });

  it('omits the typical-range line when no temperature was logged', () => {
    const base = sampleResult();
    const stats = { ...base.stats };
    delete stats['cpu.tempPackage'];
    delete stats['gpu.temp'];
    const d = buildDigest({ ...base, stats });
    expect(d.full).not.toContain('Typical for this class of hardware:');
  });
});

describe('evidence blocks', () => {
  function statsOf(log: ReturnType<typeof makeLog>): Partial<Record<CanonicalKey, Stats>> {
    const out: Partial<Record<CanonicalKey, Stats>> = {};
    for (const [k, s] of Object.entries(log.sensors)) out[k as CanonicalKey] = computeStats(s!.values);
    return out;
  }

  function richInputs() {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100, frameTimeMs: 10, gpuBusyMs: 9.6, gpuUsage: 99 } }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100, frameTimeMs: 10, gpuBusyMs: 9.6, gpuUsage: 99 } }),
      makeWindow(2, { limiter: 'cpu', tier: 'measured', metrics: { fpsAvg: 55, frameTimeMs: 18, gpuBusyMs: 11 } }),
      makeWindow(3, { activity: 'idle' }),
    ]);
    const log = makeLog({
      sensors: { 'pm.frameTimeMs': [10, 10, 18, 10], 'vram.allocatedMb': [7900], 'vram.availableMb': [292], 'vram.d3dDedicatedMb': [7000] },
      fps: { source: 'displayed', series: [100, 100, 55, null], presented1PctLow: 48 },
    });
    return { log, wa };
  }

  it('renders coverage, time split with tiers, frame times, VRAM headroom and worst moments', () => {
    const { log, wa } = richInputs();
    const d = buildDigest({ log, stats: statsOf(log), events: [], windows: wa, guidance: [] });
    expect(d.compact).toMatch(/Coverage: analyzed [\d.]+ min of gameplay out of [\d.]+ min/);
    expect(d.compact).toMatch(/Time split \(gameplay only\): .*GPU-bound \d+% \[measured\]/);
    expect(d.compact).toMatch(/CPU-bound \d+% \[measured\]/);
    expect(d.full).toMatch(/1% low 48/);
    expect(d.full).toMatch(/VRAM: D3D dedicated p95 .* of 8,?192 MB/);
    expect(d.compact).toMatch(/Worst moments:/);
  });

  it('labels the PresentMon 1% low as session-cumulative so it is not read as a windowed stat', () => {
    const { log, wa } = richInputs();
    const d = buildDigest({ log, stats: statsOf(log), events: [], windows: wa, guidance: [] });
    expect(d.full).toContain('session-wide per-frame 1% low 48 FPS (cumulative — includes loading/menus)');
  });

  it('notes wall-clock span and logging gaps when windows do not cover the log', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(20, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const d = buildDigest({ log: makeLog({}), stats: {}, events: [], windows: wa, guidance: [] });
    expect(d.compact).toMatch(/log spans 2\.8 min wall-clock \(~2\.6 min of logging gaps\) — time offsets count from log start/);
  });

  it('omits the gap note when windows tile the log', () => {
    const { log, wa } = richInputs();
    const d = buildDigest({ log, stats: {}, events: [], windows: wa, guidance: [] });
    expect(d.compact).not.toMatch(/logging gaps/);
  });

  it('events carry their evidence tag', () => {
    const { log, wa } = richInputs();
    const e = { id: 'x', type: 'gpu-bound', severity: 'warn' as const, sentence: 'GPU-bound…', sampleCount: 2,
      evidence: { tier: 'measured' as const, basis: ['b'] } };
    const d = buildDigest({ log, stats: {}, events: [e], windows: wa, guidance: [] });
    expect(d.compact).toContain('- [warn] [measured] GPU-bound…');
  });

  it('guidance renders as a missing-data block; absent when empty', () => {
    const { log, wa } = richInputs();
    const withG = buildDigest({ log, stats: {}, events: [], windows: wa,
      guidance: [{ what: 'per-core CPU usage', how: 'enable it' }] });
    expect(withG.compact).toMatch(/Missing data that would sharpen this:/);
    const withoutG = buildDigest({ log, stats: {}, events: [], windows: wa, guidance: [] });
    expect(withoutG.compact).not.toMatch(/Missing data/);
  });

  it('lists logged-but-never-fired throttle flags as explicit negatives', () => {
    const log = makeLog({ flags: {
      'flag.cpu.thermalThrottle': [false, false, false],
      'flag.gpu.perfLimitThermal': [false, false, false],
      'flag.gpu.perfLimitPower': [true, false, false],
    } });
    const d = buildDigest({ log, stats: {}, events: [], windows: makeWindowAnalysis([]), guidance: [] });
    expect(d.compact).toMatch(/- Checked, not detected: CPU thermal throttle, GPU thermal limit/);
    expect(d.compact).not.toMatch(/Checked, not detected:.*GPU power limit/);
  });

  it('omits the negatives line when no throttle flags were logged', () => {
    const d = buildDigest({ log: makeLog({}), stats: {}, events: [], windows: makeWindowAnalysis([]), guidance: [] });
    expect(d.compact).not.toMatch(/Checked, not detected/);
  });

  it('renders a context stub asking for game, cap source and power profile', () => {
    const log = makeLog({ fps: { source: 'displayed', capped: true, capValue: 163 } });
    const d = buildDigest({ log, stats: {}, events: [], windows: makeWindowAnalysis([]), guidance: [] });
    expect(d.compact).toContain('Context (fill in for better advice):');
    expect(d.compact).toContain('- Game, settings & resolution:');
    expect(d.compact).toContain('- FPS cap source (in-game / RTSS / VSync): cap measured at ~163 — intended?');
    expect(d.compact).toContain('- Power profile & cooling (performance mode, cooling pad, plugged in):');
  });

  it('omits the cap-source line when no cap was detected', () => {
    const d = buildDigest({ log: makeLog({}), stats: {}, events: [], windows: makeWindowAnalysis([]), guidance: [] });
    expect(d.compact).toContain('Context (fill in for better advice):');
    expect(d.compact).not.toMatch(/FPS cap source/);
  });

  it('workload logs word the split without "gameplay"', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'cpu' })], { activityKind: 'workload' });
    const d = buildDigest({ log: makeLog({}), stats: {}, events: [], windows: wa, guidance: [] });
    expect(d.compact).not.toMatch(/gameplay/);
  });
});
