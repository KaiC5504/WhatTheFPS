import { describe, it, expect } from 'vitest';
import { causeStorageStutter } from './storageStutter';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

const wa6 = () => makeWindowAnalysis([0, 1, 2, 3, 4, 5].map((i) => makeWindow(i)));
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

// frame-time cluster in window 2 (rows 8..11)
function spikyFt(): number[] {
  const s = flat(24, 8);
  s[9] = 30; s[10] = 28;
  return s;
}

describe('causeStorageStutter', () => {
  it('reports a frame-time cluster co-located with a drive-activity burst (info for one cluster)', () => {
    const activity = flat(24, 4);
    activity[8] = 40; activity[9] = 40; activity[10] = 40; activity[11] = 40;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': spikyFt(), 'drive.activityPct': activity } });
    const events = causeStorageStutter(log, {}, wa6());
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('storage-stutter');
    expect(e.severity).toBe('info');
    expect(e.windowIndexes).toEqual([2]);
    expect(e.evidence?.tier).toBe('inferred');
  });

  it('escalates to warn when two clusters co-locate with drive bursts', () => {
    const ft = spikyFt();
    ft[17] = 27; ft[18] = 26;                  // second cluster, window 4
    const activity = flat(24, 4);
    for (const i of [8, 9, 10, 11, 16, 17, 18, 19]) activity[i] = 40;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': ft, 'drive.activityPct': activity } });
    const [e] = causeStorageStutter(log, {}, wa6());
    expect(e.severity).toBe('warn');
    expect(e.windowIndexes).toEqual([2, 4]);
  });

  it('also matches via a read-rate burst above the gameplay p95', () => {
    const readRate = flat(24, 2);
    readRate[9] = 600; readRate[10] = 600;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': spikyFt(), 'drive.readRateMbps': readRate } });
    const [e] = causeStorageStutter(log, {}, wa6());
    expect(e).toBeDefined();
    expect(e.windowIndexes).toEqual([2]);
  });

  it('a drive burst without a frame-time cluster is not an event', () => {
    const activity = flat(24, 4);
    activity[9] = 90;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': flat(24, 8), 'drive.activityPct': activity } });
    expect(causeStorageStutter(log, {}, wa6())).toEqual([]);
  });

  it('a frame-time cluster over a calm drive is not a storage event', () => {
    const log = makeLog({ sensors: { 'pm.frameTimeMs': spikyFt(), 'drive.activityPct': flat(24, 4) } });
    expect(causeStorageStutter(log, {}, wa6())).toEqual([]);
  });

  it('requires both sensor families', () => {
    expect(causeStorageStutter(makeLog({ sensors: { 'pm.frameTimeMs': spikyFt() } }), {}, wa6())).toEqual([]);
    expect(causeStorageStutter(makeLog({ sensors: { 'drive.activityPct': flat(24, 90) } }), {}, wa6())).toEqual([]);
  });
});
