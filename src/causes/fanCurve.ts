import type { CanonicalKey, DiagEvent, NormalizedLog, Stats, WindowAnalysis, WindowClassification } from '../types';
import { makeEvent } from './events';
import { windowMean } from '../windows/slice';

const MIN_WINDOWS = 8;
const TEMP_RISE_C = 10;
const FAN_FLAT_TOLERANCE = 0.05;  // every gameplay window within ±5% of the early-gameplay mean
const FAN_HEADROOM_FRAC = 0.9;    // the flat level must sit below 90% of the fan's own session max

interface Pair {
  side: 'GPU' | 'CPU';
  tempOf: (w: WindowClassification) => number | null;
  fanKey: CanonicalKey;
}
const PAIRS: Pair[] = [
  { side: 'GPU', tempOf: (w) => w.metrics.gpuTempC, fanKey: 'fan.gpuRpm' },
  { side: 'CPU', tempOf: (w) => w.metrics.cpuTempC, fanKey: 'fan.cpuRpm' },
];

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function causeFanCurve(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  for (const pair of PAIRS) {
    const fan = log.sensors[pair.fanKey];
    if (!fan) continue;

    const usable = wa.windows
      .filter((w) => w.activity === 'gameplay')
      .map((w) => ({ w, temp: pair.tempOf(w), rpm: windowMean(fan.values, w.window) }))
      .filter((x): x is { w: WindowClassification; temp: number; rpm: number } =>
        x.temp !== null && x.rpm !== null);
    if (usable.length < MIN_WINDOWS) continue;

    const q = Math.max(2, Math.floor(usable.length / 4));
    const tempEarly = mean(usable.slice(0, q).map((x) => x.temp));
    const tempLate = mean(usable.slice(-q).map((x) => x.temp));
    if (tempLate - tempEarly < TEMP_RISE_C) continue;

    const rpmEarly = mean(usable.slice(0, q).map((x) => x.rpm));
    if (rpmEarly <= 0) continue;
    const flat = usable.every((x) => Math.abs(x.rpm - rpmEarly) <= FAN_FLAT_TOLERANCE * rpmEarly);
    if (!flat) continue;

    // A fan that never went faster anywhere in the log might simply be maxed out —
    // only call the curve out when the log itself proves headroom existed.
    let sessionMax = 0;
    for (const v of fan.values) if (v !== null && v > sessionMax) sessionMax = v;
    if (rpmEarly >= FAN_HEADROOM_FRAC * sessionMax) continue;

    const late = usable.slice(-q);
    events.push(makeEvent({
      type: 'fan-curve',
      severity: 'warn',
      sentence: `${pair.side} temp rose ${Math.round(tempLate - tempEarly)}°C during gameplay (${Math.round(tempEarly)}→${Math.round(tempLate)}°C) but the ${pair.side} fan held ~${Math.round(rpmEarly)} RPM — the fans didn't respond to rising temps; check the fan curve and clean out dust.`,
      fix: `Set a steeper ${pair.side} fan curve (or enable the performance fan mode) and clean dust from the intakes and fins.`,
      sampleCount: usable.length,
      evidence: {
        tier: 'measured',
        basis: [
          `${pair.side} temp ${Math.round(tempEarly)}→${Math.round(tempLate)}°C while fan RPM stayed within ±5% of ${Math.round(rpmEarly)} RPM`,
          `the fan reached ${Math.round(sessionMax)} RPM elsewhere in the log, so headroom existed`,
        ],
      },
      windowIndexes: late.map((x) => x.w.window.index),
    }));
  }
  return events;
}
