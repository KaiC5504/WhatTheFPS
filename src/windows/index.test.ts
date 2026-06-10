import { describe, it, expect } from 'vitest';
import { buildWindowAnalysis } from './index';
import { makeLog } from '../causes/testkit';

function syntheticLog() {
  const n = 48; // 12 windows of 4 rows at 2000ms
  const log = makeLog({
    sensors: {
      'pm.frameTimeMs': Array(n).fill(10),
      'pm.gpuBusyMs': Array(n).fill(9.5),     // dev 5% → gpu-bound
      'gpu.usage': Array(n).fill(98),
    },
    fps: { source: 'displayed', series: Array(n).fill(100), capped: false },
    pollMs: 2000,
  });
  log.timesMs = Array.from({ length: n }, (_, i) => i * 2000);
  return log;
}

describe('buildWindowAnalysis', () => {
  it('classifies a steady GPU-bound run end to end', () => {
    const wa = buildWindowAnalysis(syntheticLog());
    expect(wa.lowConfidence).toBe(false);
    expect(wa.activityKind).toBe('gameplay');
    expect(wa.windows.every((w) => w.activity === 'gameplay')).toBe(true);
    expect(wa.timeSplit.dominant).toBe('gpu');
    expect(wa.timeSplit.shares.gpu).toBeCloseTo(1);
    expect(wa.worst).toHaveLength(0); // flat run, no drops
  });

  it('marks workload (not gameplay) when no FPS exists', () => {
    const n = 48;
    const log = makeLog({ sensors: { 'cpu.usageTotal': Array(n).fill(100) }, pollMs: 2000 });
    log.timesMs = Array.from({ length: n }, (_, i) => i * 2000);
    const wa = buildWindowAnalysis(log);
    expect(wa.activityKind).toBe('workload');
    expect(wa.timeSplit.gameplayMs).toBeGreaterThan(0); // active-workload windows
  });
});
