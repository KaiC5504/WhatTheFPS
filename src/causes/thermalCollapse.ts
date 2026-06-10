import type { CanonicalKey, DiagEvent, FlagKey, NormalizedLog, Severity, Stats, WindowAnalysis, WindowClassification } from '../types';
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

// NVIDIA's "Performance Limit - Thermal" is a soft clock-cap reason, not a hardware-protection
// latch like CPU PROCHOT — it blips on for a sample or two even on a cool card. Judge it by how
// much of the session it covered, and never let a transient blip become a top-severity alarm.
const GPU_THERMAL_MIN_DENSITY = 0.05;   // below this it's measurement noise — don't surface it
const GPU_THERMAL_WARN_DENSITY = 0.25;  // sustained enough to actually be costing frames

function gpuThermalTempClause(stats: Partial<Record<CanonicalKey, Stats>>): string {
  const edge = stats['gpu.temp'];
  const hot = stats['gpu.hotspot'];
  const e = edge && edge.count > 0 ? Math.round(edge.max) : null;
  const h = hot && hot.count > 0 ? Math.round(hot.max) : null;
  // The hotspot runs ~15–25°C hotter than the edge by design and throttles much higher, so it is
  // only ever shown labeled — never as the bare "GPU temp" the user recognizes from MSI/Afterburner.
  if (e !== null && h !== null) return ` (GPU temp peaked ${e}°C, hotspot ${h}°C)`;
  if (e !== null) return ` (GPU temp peaked ${e}°C)`;
  if (h !== null) return ` (GPU hotspot peaked ${h}°C)`;
  return '';
}

function gpuThermalEvent(stats: Partial<Record<CanonicalKey, Stats>>, count: number, total: number): DiagEvent | null {
  const density = total > 0 ? count / total : 0;
  if (density < GPU_THERMAL_MIN_DENSITY) return null;
  const pct = Math.round(density * 100);
  const severity: Severity = density >= GPU_THERMAL_WARN_DENSITY ? 'warn' : 'info';
  return makeEvent({
    type: 'throttling',
    severity,
    sentence: `GPU clocks were thermally limited ${pct}% of the session${gpuThermalTempClause(stats)}.`,
    fix: 'Improve GPU cooling (fan curve, dust, pads) or undervolt to keep clocks up.',
    sampleCount: count,
    evidence: { tier: 'measured', basis: [`GPU thermal-limit flag latched in ${pct}% of samples`] },
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
    const ev = gpuThermalEvent(stats, countTrue(gpuThermalFlag.values), gpuThermalFlag.values.length);
    if (ev) events.push(ev);
  }

  const collapse = collapseEvent(wa);
  if (collapse) events.push(collapse);
  return events;
}
