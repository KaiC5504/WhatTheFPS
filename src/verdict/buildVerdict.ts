import type {
  NormalizedLog, CanonicalKey, Stats, DiagEvent,
  Verdict, Health, MascotMood, HeroNumber, Finding, Severity,
} from '../types';

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

function tempTile(key: string, label: string, value: number | null, warnAt: number, badAt: number): HeroNumber {
  return {
    key,
    label,
    value: value === null ? '—' : `${Math.round(value)}°C`,
    severity: tempSeverity(value, warnAt, badAt),
  };
}

function buildHero(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): HeroNumber[] {
  const fpsAvg = log.fps.source === 'none' ? null : log.fps.stats?.avg ?? null;
  const fpsTile: HeroNumber = {
    key: 'fps',
    label: 'Avg FPS',
    value: fpsAvg === null ? '—' : `${Math.round(fpsAvg)}`,
    severity: 'info',
  };

  return [
    fpsTile,
    usageTile('cpu.usageTotal', 'CPU usage', avgOf(stats, 'cpu.usageTotal')),
    tempTile('cpu.temp', 'CPU temp', maxOf(stats, ['cpu.tempPackage', 'cpu.tempCoreMax']), 90, 100),
    usageTile('gpu.usage', 'GPU usage', avgOf(stats, 'gpu.usage')),
    tempTile('gpu.temp', 'GPU temp', maxOf(stats, ['gpu.temp']), 85, 90),
  ];
}

function sortedFindings(events: DiagEvent[]): DiagEvent[] {
  return [...events].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

export function buildVerdict(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  events: DiagEvent[],
): Verdict {
  const health = healthFromEvents(events);
  const ranked = sortedFindings(events);

  const findings: Finding[] = ranked.slice(0, 4).map((e) => {
    const f: Finding = { severity: e.severity, text: e.sentence };
    if (e.fix !== undefined) f.fix = e.fix;
    return f;
  });

  const headline = ranked.length > 0 ? ranked[0].sentence : 'Everything looks healthy.';

  return {
    health,
    mascotMood: MOOD[health],
    headline,
    hero: buildHero(log, stats),
    findings,
  };
}
