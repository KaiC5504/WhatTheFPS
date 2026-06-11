import { describe, it, expect } from 'vitest';
import { causeFanCurve } from './fanCurve';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

// 8 gameplay windows of ramping temps, preceded by one idle window (rows 0..3),
// so the fan series has 9 windows × 4 rows = 36 values.
const tempsRamp = [60, 60, 62, 64, 66, 68, 70, 72];
const perWindowRows = (perWindow: number[]) => perWindow.flatMap((v) => [v, v, v, v]);

function gpuFixture(fanPerWindow: number[], temps = tempsRamp) {
  const windows = [
    makeWindow(0, { activity: 'idle' }),
    ...temps.map((t, i) => makeWindow(i + 1, { metrics: { gpuTempC: t } })),
  ];
  const log = makeLog({ sensors: { 'fan.gpuRpm': perWindowRows(fanPerWindow) } });
  return { log, wa: makeWindowAnalysis(windows) };
}

describe('causeFanCurve', () => {
  it('fires when temps climb ≥10°C and the fan stays flat despite proven headroom', () => {
    // idle burst at 3500 RPM proves headroom; gameplay holds a flat 2000 RPM
    const { log, wa } = gpuFixture([3500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]);
    const events = causeFanCurve(log, {}, wa);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('fan-curve');
    expect(e.severity).toBe('warn');
    expect(e.sentence).toMatch(/didn't respond to rising temps/);
    expect(e.sentence).toMatch(/fan curve/);
    expect(e.windowIndexes).toEqual([7, 8]);          // last quarter of the 8 gameplay windows
    expect(e.evidence?.tier).toBe('measured');
  });

  it('stays silent when the fan ramps with the temps', () => {
    const { log, wa } = gpuFixture([3500, 2000, 2100, 2200, 2400, 2600, 2800, 3000, 3200]);
    expect(causeFanCurve(log, {}, wa)).toEqual([]);
  });

  it('stays silent when the fan is flat at its observed max (cooling maxed ≠ bad curve)', () => {
    const { log, wa } = gpuFixture([3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500]);
    expect(causeFanCurve(log, {}, wa)).toEqual([]);
  });

  it('stays silent without a temp rise or without the fan sensor', () => {
    const flatTemps = [60, 60, 60, 60, 60, 61, 61, 61];
    const { log, wa } = gpuFixture([3500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000], flatTemps);
    expect(causeFanCurve(log, {}, wa)).toEqual([]);
    const { wa: wa2 } = gpuFixture([3500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]);
    expect(causeFanCurve(makeLog({}), {}, wa2)).toEqual([]);
  });

  it('checks the CPU pair too', () => {
    const windows = [
      makeWindow(0, { activity: 'idle' }),
      ...tempsRamp.map((t, i) => makeWindow(i + 1, { metrics: { cpuTempC: t } })),
    ];
    const log = makeLog({ sensors: { 'fan.cpuRpm': perWindowRows([4000, 2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200]) } });
    const [e] = causeFanCurve(log, {}, makeWindowAnalysis(windows));
    expect(e.sentence).toContain('CPU');
  });
});
