import type {
  NormalizedLog, CanonicalKey, Stats, DiagEvent,
  Verdict, Health, MascotMood, HeroNumber, Finding, Severity,
  WindowAnalysis, TimeSplit, Limiter,
} from '../types';
import { buildGuidance } from './guidance';
import { lookupTempRange } from '../reference/tempRanges';

const SEVERITY_RANK: Record<Severity, number> = { bad: 3, warn: 2, info: 1 };

function worstSeverity(events: DiagEvent[]): Severity | null {
  let worst: Severity | null = null;
  for (const e of events) {
    if (worst === null || SEVERITY_RANK[e.severity] > SEVERITY_RANK[worst]) worst = e.severity;
  }
  return worst;
}

function healthFromEvents(events: DiagEvent[]): Health {
  const w = worstSeverity(events);
  if (w === 'bad') return 'bad';
  if (w === 'warn') return 'warn';
  return 'good';
}

const MOOD: Record<Health, MascotMood> = { bad: 'panic', warn: 'concerned', good: 'chill' };

function maxOf(stats: Partial<Record<CanonicalKey, Stats>>, keys: CanonicalKey[]): number | null {
  let m: number | null = null;
  for (const k of keys) {
    const s = stats[k];
    if (s && s.count > 0) m = m === null ? s.max : Math.max(m, s.max);
  }
  return m;
}

function avgOf(stats: Partial<Record<CanonicalKey, Stats>>, key: CanonicalKey): number | null {
  const s = stats[key];
  return s && s.count > 0 ? s.avg : null;
}

function tempSeverity(value: number | null, warnAt: number, badAt: number): Severity {
  if (value === null) return 'info';
  if (value >= badAt) return 'bad';
  if (value >= warnAt) return 'warn';
  return 'info';
}

function usageTile(key: string, label: string, value: number | null): HeroNumber {
  return {
    key,
    label,
    value: value === null ? '—' : `${Math.round(value)}%`,
    severity: 'info',
  };
}

// Headline number is the session average (what MSI/G-Helper show); a smaller secondary
// reading sits underneath. Color comes from the peak, so a brief spike still flags even when
// the average looks calm.
function tempTile(
  key: string, label: string,
  avg: number | null, peakValue: number | null,
  sub: string | null,
  warnAt: number, badAt: number,
): HeroNumber {
  const tile: HeroNumber = {
    key,
    label,
    value: avg === null ? '—' : `${Math.round(avg)}°C`,
    severity: tempSeverity(peakValue, warnAt, badAt),
  };
  if (sub) tile.sub = sub;
  return tile;
}

function buildHero(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): HeroNumber[] {
  const fpsAvg = log.fps.source === 'none' ? null : log.fps.stats?.avg ?? null;
  const fpsTile: HeroNumber = {
    key: 'fps',
    label: 'Avg FPS',
    value: fpsAvg === null ? '—' : `${Math.round(fpsAvg)}`,
    severity: 'info',
  };

  // CPU: package average headline (the standard "CPU temp"), all-core average as the sub.
  const cpuPkgAvg = avgOf(stats, 'cpu.tempPackage');
  const cpuCoreAvg = avgOf(stats, 'cpu.tempCoreAvg');
  const cpuMain = cpuPkgAvg ?? cpuCoreAvg ?? avgOf(stats, 'cpu.tempCoreMax');
  const cpuSub = cpuPkgAvg !== null && cpuCoreAvg !== null ? `cores ${Math.round(cpuCoreAvg)}°C` : null;

  // GPU: edge-temp average headline, hotspot peak as the sub.
  const gpuHotPeak = maxOf(stats, ['gpu.hotspot']);
  const gpuSub = gpuHotPeak !== null ? `hotspot ${Math.round(gpuHotPeak)}°C` : null;

  const cpuRange = lookupTempRange('cpu', log.specs);
  const gpuRange = lookupTempRange('gpu', log.specs);
  return [
    fpsTile,
    usageTile('cpu.usageTotal', 'CPU usage', avgOf(stats, 'cpu.usageTotal')),
    tempTile('cpu.temp', 'CPU temp', cpuMain, maxOf(stats, ['cpu.tempPackage', 'cpu.tempCoreMax']), cpuSub,
      cpuRange.warnAt, cpuRange.badAt),
    usageTile('gpu.usage', 'GPU usage', avgOf(stats, 'gpu.usage')),
    tempTile('gpu.temp', 'GPU temp', avgOf(stats, 'gpu.temp'), maxOf(stats, ['gpu.temp']), gpuSub,
      gpuRange.warnAt, gpuRange.badAt),
  ];
}

function sortedFindings(events: DiagEvent[]): DiagEvent[] {
  return [...events].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

function pctOf(split: TimeSplit, key: Limiter): number {
  return Math.round((split.shares[key] ?? 0) * 100);
}

function headlineFrom(
  split: TimeSplit,
  capValue: number | null,
  activityKind: 'gameplay' | 'workload',
): string | null {
  const word = activityKind === 'gameplay' ? 'gameplay' : 'the workload';
  switch (split.dominant) {
    case 'gpu':
      return `GPU-bound for ${pctOf(split, 'gpu')}% of ${word} — your graphics card is the limit.`;
    case 'cpu':
      return `CPU-bound for ${pctOf(split, 'cpu')}% of ${word} — the processor is holding your GPU back.`;
    case 'capped':
      return `FPS capped at ~${capValue ?? '?'} for ${pctOf(split, 'capped')}% of ${word} — the limiter is doing its job.`;
    case 'underutilized':
      return `The GPU never got fully fed — likely an engine or driver bottleneck, not your hardware.`;
    case 'ambiguous':
    case 'mixed':
      return `Mixed picture — the limit moves around (GPU ${pctOf(split, 'gpu')}%, CPU ${pctOf(split, 'cpu')}%, unclear ${pctOf(split, 'ambiguous')}%).`;
    default:
      return null;
  }
}

const FIX_PRIORITY = ['thermal-collapse', 'vram-pressure'] as const;
const LIMITER_EVENT: Partial<Record<Limiter | 'mixed', string[]>> = {
  cpu: ['cpu-bottleneck-core', 'cpu-bottleneck'],
  gpu: ['gpu-bound'],
  underutilized: ['gpu-underutilized'],
  capped: ['fps-cap'],
};

function pickPrimaryFix(events: DiagEvent[], split: TimeSplit): Finding | null {
  const byType = (t: string) => events.find((e) => e.type === t);
  const ordered: (DiagEvent | undefined)[] = [
    ...FIX_PRIORITY.map(byType),
    ...(split.dominant !== null ? (LIMITER_EVENT[split.dominant] ?? []).map(byType) : []),
  ];
  const ranked = [...events].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const chosen = ordered.find((e) => e !== undefined) ?? ranked[0];
  if (!chosen) return null;
  const f: Finding = { severity: chosen.severity, text: chosen.sentence };
  if (chosen.fix !== undefined) f.fix = chosen.fix;
  if (chosen.evidence !== undefined) f.evidence = chosen.evidence;
  return f;
}

export function buildVerdict(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  events: DiagEvent[],
  windows: WindowAnalysis,
): Verdict {
  const health = healthFromEvents(events);
  const ranked = sortedFindings(events);

  const findings: Finding[] = ranked.slice(0, 4).map((e) => {
    const f: Finding = { severity: e.severity, text: e.sentence };
    if (e.fix !== undefined) f.fix = e.fix;
    if (e.evidence !== undefined) f.evidence = e.evidence;
    return f;
  });

  const split = windows.timeSplit;
  const hasGameplay = split.gameplayMs > 0;
  const hasWindows = windows.windows.length > 0;
  const guidance = buildGuidance(log);

  const splitHeadline = hasGameplay
    ? headlineFrom(split, log.fps.capValue, windows.activityKind)
    : null;
  // Inconclusive only when we had windows to analyze but couldn't determine a limiter
  const inconclusive = hasWindows && splitHeadline === null && ranked.length === 0;
  const headline = splitHeadline
    ?? (inconclusive
      ? "Couldn't pin down the bottleneck from this log — here's how to find out."
      : ranked.length > 0 ? ranked[0].sentence : 'Everything looks healthy.');

  const mascotMood: MascotMood = inconclusive ? 'concerned' : MOOD[health];

  return {
    health,
    mascotMood,
    headline,
    hero: buildHero(log, stats),
    findings,
    timeSplit: hasGameplay ? split : null,
    worst: windows.worst,
    primaryFix: pickPrimaryFix(events, split),
    coverage: hasGameplay ? { gameplayMs: split.gameplayMs, totalMs: split.totalMs } : null,
    guidance,
  };
}
