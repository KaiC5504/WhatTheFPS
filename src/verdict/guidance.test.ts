import { describe, it, expect } from 'vitest';
import { buildGuidance } from './guidance';
import { makeLog } from '../causes/testkit';

describe('buildGuidance', () => {
  it('a bare log gets the full checklist: PresentMon, framerate, polling, per-core', () => {
    const log = makeLog({ pollMs: 2000 });
    const g = buildGuidance(log);
    expect(g.map((x) => x.what).join(' ')).toMatch(/PresentMon/);
    expect(g.map((x) => x.what).join(' ')).toMatch(/framerate/i);
    expect(g.map((x) => x.what).join(' ')).toMatch(/polling/i);
    expect(g.map((x) => x.what).join(' ')).toMatch(/per-core/i);
  });

  it('a fully-instrumented fast log gets no guidance', () => {
    const log = makeLog({
      sensors: { 'pm.gpuBusyMs': [1], 'pm.frameTimeMs': [1] },
      fps: { source: 'displayed', series: [100] },
      pollMs: 500,
    });
    log.cores = { usage: [{ label: 'Core 0 T0', coreType: 'std', coreIndex: 0, thread: 0, values: [1] }], effectiveClock: [] };
    expect(buildGuidance(log)).toHaveLength(0);
  });
});
