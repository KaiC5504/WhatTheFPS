import type { NormalizedLog, CanonicalKey, FlagKey, Stats, DiagEvent } from '../types';
import { makeEvent } from './events';

const HOTSPOT_DELTA_C = 15;
const RAM_P95_PCT = 90;
const PAGEFILE_P95_PCT = 80;
const POWER_LIMIT_DENSITY = 0.2;

function density(log: NormalizedLog, key: FlagKey): number | null {
  const flag = log.flags[key];
  if (!flag || flag.values.length === 0) return null;
  let n = 0;
  for (const v of flag.values) if (v) n++;
  return n / flag.values.length;
}

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

export function detectPowerHotspotRam(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  const powerChecks: { key: FlagKey; label: string }[] = [
    { key: 'flag.cpu.powerLimit', label: 'CPU' },
    { key: 'flag.gpu.perfLimitPower', label: 'GPU' },
  ];
  for (const { key, label } of powerChecks) {
    const d = density(log, key);
    if (d === null || d < POWER_LIMIT_DENSITY) continue;
    const pct = Math.round(d * 100);
    const flag = log.flags[key]!;
    const count = flag.values.filter((v) => v).length;
    events.push(makeEvent({
      type: 'power-limit',
      severity: d >= 0.5 ? 'warn' : 'info',
      sentence: `${label} hit its power limit ${pct}% of the time.`,
      fix: 'Raising the power limit (if your cooling allows) lets it boost higher; lowering it trades a little performance for lower temps.',
      sampleCount: count,
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
      }));
    }
  }

  const ramLoad = stats['ram.loadPct'];
  const pagefile = stats['pagefile.usagePct'];
  const ramHigh = ramLoad !== undefined && ramLoad.count > 0 && ramLoad.p95 > RAM_P95_PCT;
  const pageHigh = pagefile !== undefined && pagefile.count > 0 && pagefile.p95 > PAGEFILE_P95_PCT;
  if (ramHigh || pageHigh) {
    const pct = ramHigh ? Math.round(ramLoad!.p95) : Math.round(pagefile!.p95);
    const what = ramHigh ? 'Memory' : 'The pagefile';
    events.push(makeEvent({
      type: 'ram-pressure',
      severity: 'warn',
      sentence: `${what} was ~${pct}% full at peak — close background apps or add more RAM.`,
      fix: 'Close memory-heavy background apps, or add RAM if this happens under your normal workload.',
      sampleCount: ramHigh ? ramLoad!.count : pagefile!.count,
    }));
  }

  return events;
}
