import type { CanonicalKey, DiagEvent, FlagKey, NormalizedLog, Stats, WindowAnalysis, WindowClassification } from '../types';
import { makeEvent } from './events';
import { linearTrend } from '../stats/trend';

const THROTTLE_FIX = 'Improve cooling, lower the power limit, or undervolt to keep clocks up.';

const MIN_WINDOWS = 8;
const MIN_SPAN_MS = 4 * 60_000;
const FPS_SAG_RATIO = 0.92;
const CLOCK_SAG_RATIO = 0.95;
const TEMP_NEAR_MAX_C = 3;
const TREND_MIN_R2 = 0.3;

const THERMAL_POWER_FLAGS: FlagKey[] = [
  'flag.cpu.thermalThrottle', 'flag.cpu.prochot', 'flag.cpu.ratl', 'flag.cpu.powerLimit',
  'flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitPower',
];

interface FlagCheck { key: FlagKey; label: string; }

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
  hardwareLabel: string,
  flagLabel: string,
  count: number,
  peak: number | null,
): DiagEvent {
  const severity = count >= 2 ? 'bad' : 'warn';
  const tempClause = peak !== null ? ` (peak ${Math.round(peak)}°C)` : '';
  const sentence = `${hardwareLabel} hit ${flagLabel} in ${count} ${count === 1 ? 'sample' : 'samples'}${tempClause}.`;
  return makeEvent({
    type: 'throttling', severity, sentence, fix: THROTTLE_FIX, sampleCount: count,
    evidence: { tier: 'measured', basis: ['hardware-latched throttle flag'] },
  });
}

function epochMean(ws: WindowClassification[], pick: (w: WindowClassification) => number | null): number | null {
  let sum = 0, n = 0;
  for (const w of ws) {
    const v = pick(w);
    if (v !== null) { sum += v; n++; }
  }
  return n === 0 ? null : sum / n;
}

function flagEpochDensity(ws: WindowClassification[]): number {
  if (ws.length === 0) return 0;
  return ws.filter((w) => w.metrics.flagsFired.some((f) => THERMAL_POWER_FLAGS.includes(f))).length / ws.length;
}

function collapseEvent(wa: WindowAnalysis): DiagEvent | null {
  const gameplay = wa.windows.filter((w) => w.activity === 'gameplay');
  if (gameplay.length < MIN_WINDOWS) return null;
  const spanMs = gameplay[gameplay.length - 1].window.endMs - gameplay[0].window.startMs;
  if (spanMs < MIN_SPAN_MS) return null;

  const q = Math.max(2, Math.floor(gameplay.length / 4));
  const early = gameplay.slice(0, q);
  const late = gameplay.slice(-q);

  const fpsE = epochMean(early, (w) => w.metrics.fpsAvg);
  const fpsL = epochMean(late, (w) => w.metrics.fpsAvg);
  if (fpsE === null || fpsL === null || fpsE <= 0 || fpsL / fpsE >= FPS_SAG_RATIO) return null;

  const gpuE = epochMean(early, (w) => w.metrics.gpuClockEffMhz);
  const gpuL = epochMean(late, (w) => w.metrics.gpuClockEffMhz);
  const cpuE = epochMean(early, (w) => w.metrics.cpuClockEffMhz);
  const cpuL = epochMean(late, (w) => w.metrics.cpuClockEffMhz);
  const gpuSag = gpuE !== null && gpuL !== null && gpuE > 0 && gpuL / gpuE < CLOCK_SAG_RATIO;
  const cpuSag = cpuE !== null && cpuL !== null && cpuE > 0 && cpuL / cpuE < CLOCK_SAG_RATIO;
  if (!gpuSag && !cpuSag) return null;

  const tempPick = gpuSag ? (w: WindowClassification) => w.metrics.gpuTempC : (w: WindowClassification) => w.metrics.cpuTempC;
  const temps = gameplay.map(tempPick).filter((t): t is number => t !== null);
  const sessionMax = temps.length ? Math.max(...temps) : null;
  const lateTemp = epochMean(late, tempPick);
  const tempNearMax = sessionMax !== null && lateTemp !== null && lateTemp >= sessionMax - TEMP_NEAR_MAX_C;
  const flagsRising = flagEpochDensity(late) > flagEpochDensity(early);
  if (!tempNearMax && !flagsRising) return null;

  // Reject bimodal logs (two in-game areas) masquerading as heat soak.
  const centers = gameplay.map((w) => (w.window.startMs + w.window.endMs) / 2);
  const trend = linearTrend(centers, gameplay.map((w) => w.metrics.fpsAvg));
  if (!trend || trend.slopePerMin >= 0 || trend.r2 < TREND_MIN_R2) return null;

  const side = gpuSag ? 'GPU' : 'CPU';
  const dropPct = Math.round((1 - fpsL / fpsE) * 100);
  const clockE = gpuSag ? (gpuE as number) : (cpuE as number);
  const clockL = gpuSag ? (gpuL as number) : (cpuL as number);
  const clockDropPct = Math.round((1 - clockL / clockE) * 100);
  const tempClause = lateTemp !== null ? ` at ${Math.round(lateTemp)}°C` : '';

  return makeEvent({
    type: 'thermal-collapse',
    severity: 'warn',
    sentence: `FPS fell ${dropPct}% from the start of the session to the end while ${side} clocks dropped ${clockDropPct}%${tempClause} — classic heat-soak throttling.`,
    fix: THROTTLE_FIX,
    sampleCount: gameplay.length,
    evidence: {
      tier: flagsRising ? 'measured' : 'inferred',
      basis: [
        `first vs last quarter of the session: ${Math.round(fpsE)} → ${Math.round(fpsL)} FPS, ${side} effective clock ${Math.round(clockE)} → ${Math.round(clockL)} MHz`,
        ...(flagsRising ? ['thermal/power limit flags fired more often late in the session'] : []),
      ],
    },
    windowIndexes: late.map((w) => w.window.index),
  });
}

export function causeThermalCollapse(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  const cpuPeak = peakTemp(stats, ['cpu.tempCoreMax', 'cpu.tempPackage']);
  for (const fc of CPU_FLAGS) {
    const flag = log.flags[fc.key];
    if (!flag) continue;
    const count = countTrue(flag.values);
    if (count === 0) continue;
    events.push(flagEvent('CPU', fc.label, count, cpuPeak));
  }

  const gpuThermalFlag = log.flags['flag.gpu.perfLimitThermal'];
  if (gpuThermalFlag) {
    const count = countTrue(gpuThermalFlag.values);
    if (count > 0) {
      events.push(flagEvent('GPU', 'its thermal limit', count, peakTemp(stats, ['gpu.temp', 'gpu.hotspot'])));
    }
  }

  const collapse = collapseEvent(wa);
  if (collapse) events.push(collapse);
  return events;
}
