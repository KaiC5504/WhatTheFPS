import type {
  NormalizedLog, CanonicalKey, Stats, DiagEvent,
  Digest, DigestMode, InferredSpecs,
} from '../types';

const DEFAULT_GOAL = 'help me lower temps without losing FPS';

function n(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

interface SensorLine {
  key: CanonicalKey;
  label: string;
  unit: string;
  kind: 'level' | 'usage'; // level → avg/p95/p99/max; usage → avg/p1/p5 lows
}

// Compact set: the sensors a tuning conversation usually needs first.
const COMPACT_SENSORS: SensorLine[] = [
  { key: 'cpu.tempPackage', label: 'CPU temp', unit: '°C', kind: 'level' },
  { key: 'cpu.tempCoreMax', label: 'CPU core temp (max)', unit: '°C', kind: 'level' },
  { key: 'gpu.temp', label: 'GPU temp', unit: '°C', kind: 'level' },
  { key: 'gpu.hotspot', label: 'GPU hotspot', unit: '°C', kind: 'level' },
  { key: 'gpu.clock', label: 'GPU clock', unit: 'MHz', kind: 'level' },
  { key: 'cpu.usageTotal', label: 'CPU usage', unit: '%', kind: 'usage' },
  { key: 'gpu.usage', label: 'GPU usage', unit: '%', kind: 'usage' },
];

// Full set: everything in compact plus the lower-level detail.
const FULL_EXTRA_SENSORS: SensorLine[] = [
  { key: 'cpu.clock', label: 'CPU clock', unit: 'MHz', kind: 'level' },
  { key: 'gpu.memJunction', label: 'GPU mem junction', unit: '°C', kind: 'level' },
  { key: 'gpu.power', label: 'GPU power', unit: 'W', kind: 'level' },
  { key: 'cpu.power', label: 'CPU power', unit: 'W', kind: 'level' },
  { key: 'gpu.memUsagePct', label: 'GPU mem usage', unit: '%', kind: 'usage' },
  { key: 'ram.loadPct', label: 'RAM load', unit: '%', kind: 'usage' },
  { key: 'cpu.usageCoreMax', label: 'CPU core usage (max)', unit: '%', kind: 'usage' },
];

function sensorLine(def: SensorLine, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const s = stats[def.key];
  if (!s || s.count === 0) return null;
  const u = def.unit === '%' ? '%' : ` ${def.unit}`;
  if (def.kind === 'level') {
    return `- ${def.label}: avg ${n(s.avg)}${u}, p95 ${n(s.p95)}${u}, p99 ${n(s.p99)}${u}, max ${n(s.max)}${u}`;
  }
  return `- ${def.label}: avg ${n(s.avg)}${u}, 1% low ${n(s.p1Low)}${u}, 5% low ${n(s.p5Low)}${u}`;
}

function fpsLine(log: NormalizedLog): string {
  if (log.fps.source === 'none' || log.fps.stats === null) return '- FPS: no framerate logged';
  const label = log.fps.sourceLabel || log.fps.source;
  const s = log.fps.stats;
  return `- FPS (source: ${label}): avg ${n(s.avg)}, 1% low ${n(s.p1Low)}, 5% low ${n(s.p5Low)}`;
}

function specsBlock(specs: InferredSpecs): string {
  const ram = specs.ramMb !== null ? `${Math.round(specs.ramMb / 1024)} GB` : 'unknown';
  const cpu = specs.cpuModelGuess ?? specs.cpuVendor;
  const gpu = specs.gpuModelGuess ?? specs.gpuVendor;
  const form = specs.isLaptop ? 'laptop' : 'desktop';
  return [
    'System (inferred, edit if wrong):',
    `- CPU: ${cpu}`,
    `- GPU: ${gpu}`,
    `- RAM: ${ram}`,
    `- Form factor: ${form}`,
  ].join('\n');
}

function eventsBlock(events: DiagEvent[]): string {
  if (events.length === 0) return 'Detected events:\n- none — nothing notable flagged.';
  const lines = events.map((e) => `- [${e.severity}] ${e.sentence}`);
  return ['Detected events:', ...lines].join('\n');
}

function render(
  mode: DigestMode,
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  events: DiagEvent[],
  goal: string,
): string {
  const defs = mode === 'full' ? [...COMPACT_SENSORS, ...FULL_EXTRA_SENSORS] : COMPACT_SENSORS;
  const sensorLines = defs.map((d) => sensorLine(d, stats)).filter((l): l is string => l !== null);

  const parts: string[] = [];
  parts.push(`HWiNFO session summary (${mode}):`);
  parts.push('');
  parts.push(specsBlock(log.specs));
  parts.push('');
  parts.push('Sensors:');
  parts.push(...sensorLines);
  parts.push(fpsLine(log));

  if (mode === 'full' && log.fps.source !== 'none') {
    parts.push(
      `- FPS split: presented avg ${log.fps.presentedAvg !== null ? n(log.fps.presentedAvg) : 'n/a'}, displayed avg ${log.fps.displayedAvg !== null ? n(log.fps.displayedAvg) : 'n/a'}${log.fps.capped && log.fps.capValue !== null ? ` (capped ~${n(log.fps.capValue)})` : ''}`,
    );
  }

  parts.push('');
  parts.push(eventsBlock(events));
  parts.push('');
  parts.push(`Goal: ${goal}`);

  return parts.join('\n');
}

export function buildDigest(input: {
  log: NormalizedLog;
  stats: Partial<Record<CanonicalKey, Stats>>;
  events: DiagEvent[];
  goal?: string;
}): Digest {
  const goal = input.goal ?? DEFAULT_GOAL;
  const compact = render('compact', input.log, input.stats, input.events, goal);
  const full = render('full', input.log, input.stats, input.events, goal);

  return {
    compact,
    full,
    tokenEstimate: {
      compact: Math.ceil(compact.length / 4),
      full: Math.ceil(full.length / 4),
    } as Record<DigestMode, number>,
    fpsSourceLabel: input.log.fps.source === 'none' ? '' : input.log.fps.sourceLabel,
  };
}
