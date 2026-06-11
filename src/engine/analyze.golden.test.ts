import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from './analyze';
import type { AnalysisResult } from '../types';

// Real HWiNFO exports are Windows-1252; read them as raw bytes (never utf-8 strings)
// and let decodeBytes handle the code page. cwd is the repo root under vitest.
const SAMPLES_ROOT = join(process.cwd(), 'HWINFO samples');
const sample = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(SAMPLES_ROOT, rel)));

function allSampleLogs(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(SAMPLES_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of readdirSync(join(SAMPLES_ROOT, entry.name)))
        if (f.toUpperCase().endsWith('.CSV')) out.push(join(entry.name, f));
    } else if (entry.name.toUpperCase().endsWith('.CSV')) {
      out.push(entry.name);
    }
  }
  return out;
}

describe('analyze (golden, real logs)', () => {
  it('Intel + Nvidia laptop (KaiC_NTE_undervolt-65_)', () => {
    const r = analyze(sample('Intel + Nvidia/KaiC_NTE_undervolt-65_.CSV'));

    expect(r.log.specs.cpuVendor).toBe('intel');
    expect(r.log.specs.gpuVendor).toBe('nvidia');
    expect(r.log.specs.isLaptop).toBe(true);

    // Real models recovered from the HWiNFO trailer (the bug this fixes).
    expect(r.log.specs.cpuModelGuess).toBe('Intel Core i7-13650HX');
    expect(r.log.specs.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop');
    expect(r.log.specs.igpuModelGuess).toBe('Intel UHD Graphics');
    expect(r.log.specs.systemModel).toContain('ASUS');
    expect(r.log.specs.ramModelGuess).toBe('Kingston KF556S40-16');
    expect(r.log.specs.ramModules).toBe(2);
    expect(Math.round((r.log.specs.ramMb ?? 0) / 1024)).toBe(32);

    expect(r.log.fps.source).toBe('displayed');
    const fpsAvg = r.log.fps.stats?.avg ?? NaN;
    expect(fpsAvg).toBeGreaterThan(60);
    expect(fpsAvg).toBeLessThan(200);

    // The GPU logs Performance Limit - Utilization, so a CPU-bottleneck or FPS-cap
    // event should surface.
    const capOrBottleneck = r.events.some((e) =>
      e.type === 'fps-cap' || e.type === 'cpu-bottleneck' || e.type === 'cpu-bottleneck-core',
    );
    expect(capOrBottleneck).toBe(true);

    // Phase-1 acceptance: despite CPU Busy ≈ frametime, the cap gate wins.
    expect(r.windows.timeSplit.dominant).not.toBe('cpu');
    expect(r.windows.activityKind).toBe('gameplay');
    const gameplayWindows = r.windows.windows.filter((w) => w.activity === 'gameplay');
    expect(gameplayWindows.length).toBeGreaterThan(0);

    for (const tile of r.verdict.hero) expect(tile.value).not.toContain('NaN');
  });

  it('AMD + Nvidia (A16_superposition_1080extreme_2460MHz)', () => {
    const r = analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV'));

    expect(r.log.specs.cpuVendor).toBe('amd');
    expect(r.log.specs.cpuModelGuess).toBe('AMD Ryzen 9 8940HX');
    expect(r.log.specs.gpuModelGuess).toBe('NVIDIA GeForce RTX 5070 Laptop');
    expect(r.log.specs.systemModel).toContain('ASUS');
    expect(r.log.specs.ramModules).toBe(2);
    expect((r.log.specs.ramMb ?? 0)).toBeGreaterThan(8 * 1024);

    const gpuTempMax = r.stats['gpu.temp']?.max ?? NaN;
    expect(Number.isFinite(gpuTempMax)).toBe(true);
    expect(gpuTempMax).toBeGreaterThan(0);

    expect(r.digest.compact.length).toBeGreaterThan(0);
    expect(r.digest.compact).toContain('Sensors:');
    expect(r.digest.compact).toMatch(/p95/);

    // GPU benchmark: dominant limiter is the GPU, measured via PresentMon.
    expect(r.windows.timeSplit.dominant).toBe('gpu');
    const gpuWins = r.windows.windows.filter((w) => w.limiter === 'gpu');
    expect(gpuWins.length).toBeGreaterThan(0);
    expect(gpuWins.some((w) => w.tier === 'measured')).toBe(true);

    for (const tile of r.verdict.hero) expect(tile.value).not.toContain('NaN');
  });

  it('Cinebench log (no FPS) is treated as a workload, never gameplay-worded', () => {
    const r = analyze(sample('Intel + Nvidia/StrixG16_cinebench_CPU_MultiThreads_3524pts.CSV'));
    expect(r.windows.activityKind).toBe('workload');
    for (const e of r.events) expect(e.sentence.toLowerCase()).not.toContain('gameplay');
  });

  it('ItTakesTwo: a 0.6% thermal-cap blip is not a bad headline and never shows the hotspot as the GPU peak', () => {
    const r = analyze(sample('Intel + Nvidia/KaiC_ItTakesTwo.CSV'));
    // GPU edge temp tops out ~86°C; the hotspot's ~101°C must not be presented as the GPU peak.
    expect(r.events.some((e) => /hit its thermal limit/.test(e.sentence))).toBe(false);
    expect(r.events.some((e) => /\(peak 101°C\)/.test(e.sentence))).toBe(false);
    expect(r.events.filter((e) => e.type === 'throttling').every((e) => e.severity !== 'bad')).toBe(true);
  });

  it('digest format lock (superposition log)', () => {
    const r = analyze(sample('Intel + Nvidia/StrixG16_superposition_GPU_1080extreme_5633score.CSV'));
    expect(r.digest.full).toMatchSnapshot();
  });

  it('all sample logs analyze cleanly: no throw, 5 finite hero tiles, digest text, no invented numbers', () => {
    const logs = allSampleLogs();
    expect(logs.length).toBe(13);

    for (const rel of logs) {
      let r: AnalysisResult;
      try {
        r = analyze(sample(rel));
      } catch (e) {
        throw new Error(`analyze threw on ${rel}: ${(e as Error).message}`);
      }

      expect(r.verdict.hero, rel).toHaveLength(5);
      for (const tile of r.verdict.hero) {
        expect(tile.value, `${rel} / ${tile.label}`).not.toContain('NaN');
        expect(tile.value, `${rel} / ${tile.label}`).not.toContain('undefined');
      }
      expect(r.digest.compact.length, rel).toBeGreaterThan(0);

      // Every stat we surfaced is a real, finite number — no NaN leaking into the digest.
      for (const s of Object.values(r.stats)) {
        if (!s) continue;
        for (const v of Object.values(s)) expect(Number.isFinite(v), rel).toBe(true);
      }

      // window analysis is fully finite
      expect(Number.isFinite(r.windows.timeSplit.gameplayMs), rel).toBe(true);
      expect(Number.isFinite(r.windows.timeSplit.totalMs), rel).toBe(true);
      for (const share of Object.values(r.windows.timeSplit.shares)) expect(Number.isFinite(share), rel).toBe(true);
      for (const w of r.windows.windows) {
        for (const [k, v] of Object.entries(w.metrics)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${rel} / window ${w.window.index} / ${k}`).toBe(true);
        }
      }
      for (const wm of r.windows.worst) expect(Number.isFinite(wm.fpsDropPct), rel).toBe(true);
    }
  });

  it('v2: drive/VRM columns are claimed and merged on real logs', () => {
    const amd = analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV'));
    expect(amd.stats['drive.tempC']?.count).toBeGreaterThan(0);
    expect(amd.stats['drive.activityPct']?.count).toBeGreaterThan(0);
    expect(amd.stats['vrm.tempC']?.count).toBeGreaterThan(0);
    expect(amd.log.unknownColumns.filter((c) => c.startsWith('Drive Temperature'))).toEqual([]);

    const intel = analyze(sample('Intel + Nvidia/KaiC_ItTakesTwo.CSV'));
    // four drive-temp columns across two drives merged into one worst-drive series
    expect(intel.log.sensors['drive.tempC']!.values.length).toBe(intel.log.rowCount);
    expect(intel.stats['drive.tempC']?.count).toBeGreaterThan(0);
    expect(intel.log.flags['flag.cpu.vrThermalAlert']).toBeDefined();
  });

  // THRESHOLD GUARDRAIL — a stutter / fan-curve / storage-stutter call on a clean
  // fixed-scene benchmark is a false positive by definition. If this fails, TUNE the
  // analyzer gates (SPIKE_FACTOR / WARN_INDEX / WARN_CLUSTERS / ACTIVITY_BURST_FACTOR /
  // TEMP_RISE_C) and document the change in the commit message. Do NOT delete this test.
  it('v2: no new detector fires on the benchmark samples', () => {
    const NEW_TYPES = ['stutter', 'fan-curve', 'storage-stutter'];
    const BENCHMARKS = [
      'AMD + Nvidia/A16_cinebench_MultiCore_-20UVz_1669pts.CSV',
      'AMD + Nvidia/A16_cinebench_MultiCore_-25UV_1695pts.CSV',
      'AMD + Nvidia/A16_cinebench_SingleCore_-20UV_114pts.CSV',
      'AMD + Nvidia/A16_superposition_1080extreme_0.9_2520MHz.CSV',
      'AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV',
      'Intel + Nvidia/StrixG16_cinebench_CPU_MultiThreads_3524pts.CSV',
      'Intel + Nvidia/StrixG16_cinebench_CPU_SingleCore_577pts.CSV',
      'Intel + Nvidia/StrixG16_cinebench_CPU_SingleThread_445pts_MP7.92x.CSV',
      'Intel + Nvidia/StrixG16_cinebench_GPU_46643pts.CSV',
      'Intel + Nvidia/StrixG16_superposition_GPU_1080extreme_5633score.CSV',
      'Intel + Nvidia/StrixG16_superposition_GPU_1080extreme_800mem_5693score.CSV',
    ];
    for (const rel of BENCHMARKS) {
      const r = analyze(sample(rel));
      const fired = r.events.filter((e) => NEW_TYPES.includes(e.type));
      expect(fired.map((e) => `${rel}: ${e.type} — ${e.sentence}`)).toEqual([]);
    }
  });

  it('v2: gameplay logs keep the honesty invariants on any new-detector event', () => {
    const NEW_TYPES = ['stutter', 'fan-curve', 'storage-stutter'];
    for (const rel of ['Intel + Nvidia/KaiC_ItTakesTwo.CSV', 'Intel + Nvidia/KaiC_NTE_undervolt-65_.CSV']) {
      const r = analyze(sample(rel));
      for (const e of r.events.filter((x) => NEW_TYPES.includes(x.type))) {
        // plan #2 timeline contract: non-info events must carry their windows
        if (e.severity !== 'info') expect(e.windowIndexes?.length, `${rel}: ${e.type}`).toBeGreaterThan(0);
        if (e.type === 'stutter') expect(e.sentence, rel).toContain('Sampled');
        expect(e.evidence, `${rel}: ${e.type}`).toBeDefined();
      }
    }
  });
});
