import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats/percentiles';
import { makeLog } from '../detect/testkit';
import { makeEvent } from '../detect/events';
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
  return { log, stats: statsFor(sensors), events };
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

  it('renders "no framerate logged" when there is no FPS source', () => {
    const sensors = { 'gpu.temp': [70, 71, 72] };
    const log = makeLog({ sensors, fps: { source: 'none', sourceLabel: '', stats: null } });
    const d = buildDigest({ log, stats: statsFor(sensors), events: [] });
    expect(d.compact).toContain('no framerate logged');
    expect(d.fpsSourceLabel).toBe('');
  });
});
