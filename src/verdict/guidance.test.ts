import { describe, it, expect } from 'vitest';
import { buildGuidance } from './guidance';
import { makeLog } from '../causes/testkit';

describe('buildGuidance', () => {
  it('a bare log gets the full checklist: PresentMon, framerate, polling, per-core, fans, voltage', () => {
    const log = makeLog({ pollMs: 2000 });
    const g = buildGuidance(log);
    expect(g.map((x) => x.what).join(' ')).toMatch(/PresentMon/);
    expect(g.map((x) => x.what).join(' ')).toMatch(/framerate/i);
    expect(g.map((x) => x.what).join(' ')).toMatch(/polling/i);
    expect(g.map((x) => x.what).join(' ')).toMatch(/per-core/i);
    expect(g.map((x) => x.what).join(' ')).toMatch(/fan speeds/i);
    expect(g.map((x) => x.what).join(' ')).toMatch(/GPU core voltage/i);
  });

  it('one logged fan is enough to satisfy the fan guidance', () => {
    const log = makeLog({ sensors: { 'fan.gpuRpm': [2800] } });
    expect(buildGuidance(log).map((x) => x.what).join(' ')).not.toMatch(/fan speeds/i);
  });

  it('a fully-instrumented fast log gets no guidance', () => {
    const log = makeLog({
      sensors: {
        'pm.gpuBusyMs': [1], 'pm.frameTimeMs': [1],
        'fan.cpuRpm': [3000], 'gpu.coreVoltage': [0.9],
        'drive.activityPct': [2],
      },
      fps: { source: 'displayed', series: [100] },
      pollMs: 500,
    });
    log.cores = { usage: [{ label: 'Core 0 T0', coreType: 'std', coreIndex: 0, thread: 0, values: [1] }], effectiveClock: [] };
    expect(buildGuidance(log)).toHaveLength(0);
  });

  it('asks for drive activity sensors when absent, satisfied by either drive family', () => {
    expect(buildGuidance(makeLog({})).map((x) => x.what).join(' ')).toMatch(/drive activity/i);
    const log = makeLog({ sensors: { 'drive.activityPct': [5] } });
    expect(buildGuidance(log).map((x) => x.what).join(' ')).not.toMatch(/drive activity/i);
    const log2 = makeLog({ sensors: { 'drive.readRateMbps': [100] } });
    expect(buildGuidance(log2).map((x) => x.what).join(' ')).not.toMatch(/drive activity/i);
  });
});
