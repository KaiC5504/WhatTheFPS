import type { NormalizedLog, CanonicalKey, FlagKey, Stats, DiagEvent, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { countTrue, flagDensity } from './shared';

const HOTSPOT_DELTA_C = 15;
const POWER_LIMIT_DENSITY = 0.2;

function meanDelta(a: (number | null)[], b: (number | null)[]): number | null {
  let sum = 0;
  let n = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    sum += x - y;
    n++;
  }
  return n === 0 ? null : sum / n;
}

export function causeHotspotDelta(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  _wa: WindowAnalysis,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  const powerChecks: { key: FlagKey; label: string }[] = [
    { key: 'flag.cpu.powerLimit', label: 'CPU' },
    { key: 'flag.gpu.perfLimitPower', label: 'GPU' },
  ];
  for (const { key, label } of powerChecks) {
    const d = flagDensity(log, key);
    if (d < POWER_LIMIT_DENSITY) continue;
    const pct = Math.round(d * 100);
    const flag = log.flags[key]!;
    const count = countTrue(flag.values);
    events.push(makeEvent({
      type: 'power-limit',
      severity: d >= 0.5 ? 'warn' : 'info',
      sentence: `${label} hit its power limit ${pct}% of the time.`,
      fix: 'Raising the power limit (if your cooling allows) lets it boost higher; lowering it trades a little performance for lower temps.',
      sampleCount: count,
      evidence: { tier: 'measured', basis: [`hardware-latched power-limit flag, ${pct}% of samples`] },
    }));
  }

  const hotspot = log.sensors['gpu.hotspot'];
  const coreTemp = log.sensors['gpu.temp'];
  if (hotspot && coreTemp) {
    const delta = meanDelta(hotspot.values, coreTemp.values);
    if (delta !== null && delta > HOTSPOT_DELTA_C) {
      events.push(makeEvent({
        type: 'hotspot-delta',
        severity: 'warn',
        sentence: `GPU hotspot ran ${Math.round(delta)}°C hotter than the core — a large gap can mean poor thermal contact.`,
        fix: 'Consider a repaste and fresh thermal pads if the gap is consistently this wide.',
        sampleCount: Math.min(hotspot.values.length, coreTemp.values.length),
        evidence: { tier: 'measured', basis: ['mean hotspot−core delta over the whole log'] },
      }));
    }
  }

  return events;
}
