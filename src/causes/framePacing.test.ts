import { describe, it, expect } from 'vitest';
import { causeFramePacing } from './framePacing';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

// 6 gameplay windows × 4 rows = rows 0..23 (testkit windows are 4 rows each)
const wa6 = () => makeWindowAnalysis([0, 1, 2, 3, 4, 5].map((i) => makeWindow(i)));
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('causeFramePacing', () => {
  it('stays silent on evenly paced frame times', () => {
    const log = makeLog({ sensors: { 'pm.frameTimeMs': flat(24, 8.3) } });
    expect(causeFramePacing(log, {}, wa6())).toEqual([]);
  });

  it('warns with "Sampled" wording, the polling caveat, and marks the spiked windows', () => {
    const series = flat(24, 8);
    series[9] = 30; series[10] = 28;    // cluster in window 2 (rows 8..11)
    series[17] = 26; series[18] = 27;   // cluster in window 4
    series[21] = 25; series[22] = 29;   // cluster in window 5
    const log = makeLog({ sensors: { 'pm.frameTimeMs': series } });
    const events = causeFramePacing(log, {}, wa6());
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('stutter');
    expect(e.subtype).toBe('presentmon');
    expect(e.severity).toBe('warn');
    expect(e.sentence).toContain('Sampled frame-time variability');
    expect(e.windowIndexes).toEqual([2, 4, 5]);
    expect(e.evidence?.tier).toBe('measured');
    expect(e.evidence?.basis.join(' ')).toMatch(/per-poll averages/);
  });

  it('fires on cluster count alone when the stutter index stays below the warn line', () => {
    const series = flat(24, 8);
    // 17 > 2× median (16) so each row spikes, but avg 10.25 / p99 17 → index ≈ 1.66 < 1.8
    series[9] = 17; series[10] = 17;
    series[17] = 17; series[18] = 17;
    series[21] = 17; series[22] = 17;
    const events = causeFramePacing(makeLog({ sensors: { 'pm.frameTimeMs': series } }), {}, wa6());
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('warn');
  });

  it('escalates to bad on extreme variability', () => {
    const series = flat(24, 8);
    series[9] = 100; series[10] = 100; series[17] = 100; series[18] = 100;
    const [e] = causeFramePacing(makeLog({ sensors: { 'pm.frameTimeMs': series } }), {}, wa6());
    expect(e.severity).toBe('bad');
  });

  it('falls back to RTSS frame time when PresentMon is absent', () => {
    const series = flat(24, 8);
    series[9] = 40; series[10] = 40;
    const log = makeLog({ sensors: { 'rtss.frameTimeMs': series } });
    const [e] = causeFramePacing(log, {}, wa6());
    expect(e).toBeDefined();
    expect(e.subtype).toBe('rtss');
  });

  it('does not run on workload (no-FPS) logs or without a frame-time sensor', () => {
    const series = flat(24, 8);
    series[9] = 100; series[10] = 100;
    const wa = makeWindowAnalysis([0, 1, 2, 3, 4, 5].map((i) => makeWindow(i)), { activityKind: 'workload' });
    expect(causeFramePacing(makeLog({ sensors: { 'pm.frameTimeMs': series } }), {}, wa)).toEqual([]);
    expect(causeFramePacing(makeLog({}), {}, wa6())).toEqual([]);
  });
});
