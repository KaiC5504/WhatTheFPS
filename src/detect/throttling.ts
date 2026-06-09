import type { NormalizedLog, CanonicalKey, FlagKey, Stats, DiagEvent } from '../types';
import { makeEvent } from './events';

const THROTTLE_FIX =
  'Improve cooling, lower the power limit, or undervolt to keep clocks up.';

interface FlagCheck {
  key: FlagKey;
  label: string;
}

const CPU_FLAGS: FlagCheck[] = [
  { key: 'flag.cpu.thermalThrottle', label: 'thermal throttling' },
  { key: 'flag.cpu.prochot', label: 'PROCHOT (overheat protection)' },
  { key: 'flag.cpu.ratl', label: 'RATL (running-average thermal limit)' },
];

function countTrue(values: boolean[]): number {
  let n = 0;
  for (const v of values) if (v) n++;
  return n;
}

function peakTemp(stats: Partial<Record<CanonicalKey, Stats>>, keys: CanonicalKey[]): number | null {
  let peak: number | null = null;
  for (const k of keys) {
    const s = stats[k];
    if (s && s.count > 0) peak = peak === null ? s.max : Math.max(peak, s.max);
  }
  return peak;
}

function flagEvent(
  type: string,
  hardwareLabel: string,
  flagLabel: string,
  count: number,
  peak: number | null,
): DiagEvent {
  const severity = count >= 2 ? 'bad' : 'warn';
  const tempClause = peak !== null ? ` (peak ${Math.round(peak)}°C)` : '';
  const sentence = `${hardwareLabel} hit ${flagLabel} in ${count} ${count === 1 ? 'sample' : 'samples'}${tempClause}.`;
  return makeEvent({ type, severity, sentence, fix: THROTTLE_FIX, sampleCount: count });
}

// Heuristic GPU/CPU throttle: clock dips well below its own peak while temp sits
// near its max — the classic "ran out of thermal headroom" signature.
function clockDropEvent(
  type: string,
  hardwareLabel: string,
  clock: number[] | undefined,
  tempStats: Stats | undefined,
  temps: number[] | undefined,
): DiagEvent | null {
  if (!clock || clock.length < 3 || !tempStats || tempStats.count === 0 || !temps) return null;
  const valid = clock.filter((c) => Number.isFinite(c));
  if (valid.length < 3) return null;
  const peakClock = Math.max(...valid);
  if (peakClock <= 0) return null;

  const nearMax = tempStats.max - 2;
  let hotDrops = 0;
  for (let i = 0; i < clock.length; i++) {
    const c = clock[i];
    const t = temps[i];
    if (!Number.isFinite(c) || t === undefined || t === null) continue;
    const dropPct = ((peakClock - c) / peakClock) * 100;
    if (dropPct >= 8 && t >= nearMax) hotDrops++;
  }
  if (hotDrops < 2) return null;

  const sentence = `${hardwareLabel} clocks dropped while temperature stayed near ${Math.round(tempStats.max)}°C — likely thermal throttling.`;
  return makeEvent({ type, severity: 'warn', sentence, fix: THROTTLE_FIX, sampleCount: hotDrops });
}

export function detectThrottling(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  const cpuPeak = peakTemp(stats, ['cpu.tempCoreMax', 'cpu.tempPackage']);
  for (const fc of CPU_FLAGS) {
    const flag = log.flags[fc.key];
    if (!flag) continue;
    const count = countTrue(flag.values);
    if (count === 0) continue;
    events.push(flagEvent('throttling', 'CPU', fc.label, count, cpuPeak));
  }

  const gpuThermalFlag = log.flags['flag.gpu.perfLimitThermal'];
  if (gpuThermalFlag) {
    const count = countTrue(gpuThermalFlag.values);
    if (count > 0) {
      events.push(flagEvent('throttling', 'GPU', 'its thermal limit', count, peakTemp(stats, ['gpu.temp', 'gpu.hotspot'])));
    }
  }

  const gpuClockEvent = clockDropEvent(
    'throttling',
    'GPU',
    log.sensors['gpu.clock']?.values.map((v) => v ?? NaN),
    stats['gpu.temp'],
    log.sensors['gpu.temp']?.values.map((v) => v ?? NaN),
  );
  if (gpuClockEvent) events.push(gpuClockEvent);

  return events;
}
