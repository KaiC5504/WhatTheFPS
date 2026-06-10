import { describe, it, expect } from 'vitest';
import type { NormalizedLog, AnalysisResult } from './types';

// Constructing literals of the frozen contract here means any drift in the shared
// types breaks compilation (and therefore this test file) loudly.
describe('types', () => {
  it('constructs a minimal NormalizedLog', () => {
    const log: NormalizedLog = {
      rowCount: 0,
      pollMs: 2000,
      specs: {
        systemModel: null,
        cpuVendor: 'unknown',
        cpuModelGuess: null,
        gpuVendor: 'unknown',
        gpuModelGuess: null,
        igpuModelGuess: null,
        igpuPresent: false,
        isLaptop: false,
        ramMb: null,
        ramModelGuess: null,
        ramModules: null,
      },
      sensors: { 'gpu.temp': { key: 'gpu.temp', label: 'GPU Temperature', unit: '°C', values: [74.1, null, 75.2] } },
      flags: { 'flag.cpu.prochot': { key: 'flag.cpu.prochot', label: 'PROCHOT', values: [false, true] } },
      fps: {
        source: 'none',
        sourceLabel: '',
        clean: [],
        stats: null,
        presentedAvg: null,
        displayedAvg: null,
        capped: false,
        capValue: null,
        series: [],
        presented1PctLow: null,
        presented01PctLow: null,
        rtss1PctLow: null,
      },
      unknownColumns: [],
      timesMs: [],
      cores: null,
    };
    expect(log.pollMs).toBe(2000);
    expect(log.sensors['gpu.temp']!.values).toHaveLength(3);
  });

  it('an AnalysisResult carries verdict + digest shape', () => {
    const result: Pick<AnalysisResult, 'verdict' | 'digest'> = {
      verdict: { health: 'good', mascotMood: 'chill', headline: 'ok', hero: [], findings: [], timeSplit: null, worst: [], primaryFix: null, coverage: null, guidance: [] },
      digest: { compact: 'x', full: 'xx', tokenEstimate: { compact: 1, full: 2 }, fpsSourceLabel: '' },
    };
    expect(result.verdict.mascotMood).toBe('chill');
    expect(result.digest.tokenEstimate.full).toBeGreaterThan(result.digest.tokenEstimate.compact);
  });
});
