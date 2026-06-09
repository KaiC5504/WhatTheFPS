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

    for (const tile of r.verdict.hero) expect(tile.value).not.toContain('NaN');
  });

  it('AMD + Nvidia (A16_superposition_1080extreme_2460MHz)', () => {
    const r = analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV'));

    expect(r.log.specs.cpuVendor).toBe('amd');

    const gpuTempMax = r.stats['gpu.temp']?.max ?? NaN;
    expect(Number.isFinite(gpuTempMax)).toBe(true);
    expect(gpuTempMax).toBeGreaterThan(0);

    expect(r.digest.compact.length).toBeGreaterThan(0);
    expect(r.digest.compact).toContain('Sensors:');
    expect(r.digest.compact).toMatch(/p95/);

    for (const tile of r.verdict.hero) expect(tile.value).not.toContain('NaN');
  });

  it('all 12 sample logs analyze cleanly: no throw, 5 finite hero tiles, digest text, no invented numbers', () => {
    const logs = allSampleLogs();
    expect(logs.length).toBe(12);

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
    }
  });
});
