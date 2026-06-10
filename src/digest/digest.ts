import type {
  NormalizedLog, CanonicalKey, Stats, DiagEvent,
  Digest, DigestMode, InferredSpecs,
  WindowAnalysis, SensorGuidance, Limiter, EvidenceTier,
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
  const kit = specs.ramModelGuess
    ? ` (${specs.ramModelGuess}${specs.ramModules ? ` ×${specs.ramModules}` : ''})`
    : '';
  const ram = specs.ramMb !== null ? `${Math.round(specs.ramMb / 1024)} GB${kit}` : 'unknown';
  const cpu = specs.cpuModelGuess ?? specs.cpuVendor;
  const gpu = specs.gpuModelGuess ?? specs.gpuVendor;
  const form = specs.isLaptop ? 'laptop' : 'desktop';
  const lines = ['System (inferred, edit if wrong):'];
  if (specs.systemModel) lines.push(`- Machine: ${specs.systemModel}`);
  lines.push(`- CPU: ${cpu}`);
  lines.push(`- GPU: ${gpu}`);
  if (specs.igpuPresent && specs.igpuModelGuess) lines.push(`- iGPU: ${specs.igpuModelGuess}`);
  lines.push(`- RAM: ${ram}`);
  lines.push(`- Form factor: ${form}`);
  return lines.join('\n');
}

function eventsBlock(events: DiagEvent[]): string {
  if (events.length === 0) return 'Detected events:\n- none — nothing notable flagged.';
  const lines = events.map((e) => `- [${e.severity}]${e.evidence ? ` ${TIER_TAG[e.evidence.tier]}` : ''} ${e.sentence}`);
  return ['Detected events:', ...lines].join('\n');
}

const TIER_TAG: Record<EvidenceTier, string> = { measured: '[measured]', inferred: '[inferred]' };
const LIMITER_LABEL: Record<Limiter, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'capped', underutilized: 'GPU-underutilized',
  ambiguous: 'ambiguous', unknown: 'unclassified',
};

const mins = (ms: number) => (ms / 60_000).toFixed(1);

function coverageLine(wa: WindowAnalysis): string | null {
  if (wa.timeSplit.gameplayMs <= 0) return null;
  const word = wa.activityKind === 'gameplay' ? 'gameplay' : 'active workload';
  return `Coverage: analyzed ${mins(wa.timeSplit.gameplayMs)} min of ${word} out of ${mins(wa.timeSplit.totalMs)} min logged (${Math.round(wa.windowMs / 1000)} s windows${wa.lowConfidence ? ', low confidence — short log' : ''})`;
}

function timeSplitLine(wa: WindowAnalysis): string | null {
  if (wa.timeSplit.gameplayMs <= 0) return null;
  const word = wa.activityKind === 'gameplay' ? 'gameplay' : 'workload';
  const parts = (Object.entries(wa.timeSplit.shares) as [Limiter, number][])
    .filter(([, v]) => v >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const ws = wa.windows.filter((w) => w.activity === 'gameplay' && w.limiter === k);
      // majority rule: tag measured only when ≥50% of this limiter's windows have measured-tier coverage
      const measured = ws.length > 0 && ws.filter((w) => w.tier === 'measured').length * 2 >= ws.length;
      const tag = ws.some((w) => w.tier !== null) ? ` ${TIER_TAG[measured ? 'measured' : 'inferred']}` : '';
      return `${LIMITER_LABEL[k]} ${Math.round(v * 100)}%${tag}`;
    });
  return parts.length ? `Time split (${word} only): ${parts.join(', ')}` : null;
}

function frameTimesLine(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const ft = stats['pm.frameTimeMs'];
  if (!ft || ft.count === 0) return null;
  const low = log.fps.presented1PctLow;
  return `Frame times (PresentMon): avg ${n(ft.avg)} ms, p99 ${n(ft.p99)} ms${low !== null ? `, 1% low ${n(low)} FPS` : ''}`;
}

function vramLine(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const ded = stats['vram.d3dDedicatedMb'];
  if (!ded || ded.count === 0) return null;
  const alloc = log.sensors['vram.allocatedMb']?.values ?? [];
  const avail = log.sensors['vram.availableMb']?.values ?? [];
  let capacity = 0;
  for (let i = 0; i < Math.min(alloc.length, avail.length); i++) {
    const a = alloc[i], b = avail[i];
    if (a !== null && b !== null) capacity = Math.max(capacity, a + b);
  }
  if (capacity <= 0) return `VRAM: D3D dedicated p95 ${Math.round(ded.p95).toLocaleString('en-US')} MB`;
  const headroom = Math.max(0, Math.round(capacity - ded.p95));
  return `VRAM: D3D dedicated p95 ${Math.round(ded.p95).toLocaleString('en-US')} MB of ${Math.round(capacity).toLocaleString('en-US')} MB (~${headroom.toLocaleString('en-US')} MB headroom)`;
}

function worstBlock(wa: WindowAnalysis, logStartMs: number): string | null {
  if (wa.worst.length === 0) return null;
  const lines = wa.worst.map((wm) => {
    const c = wm.classification;
    const offset = c.window.startMs - logStartMs;
    const mm = Math.floor(offset / 60_000);
    const ss = Math.round((offset % 60_000) / 1000);
    const snap = wm.snapshot.map((s) => `${s.label} ${s.value}${s.unit ? ` ${s.unit}` : ''}`).join(', ');
    const tag = c.tier !== null ? ` ${TIER_TAG[c.tier]}` : '';
    return `- +${mm}m${String(ss).padStart(2, '0')}s: −${Math.round(wm.fpsDropPct)}% vs median (${LIMITER_LABEL[c.limiter]}) — ${snap}${tag}`;
  });
  return ['Worst moments:', ...lines].join('\n');
}

function guidanceBlock(guidance: SensorGuidance[]): string | null {
  if (guidance.length === 0) return null;
  return ['Missing data that would sharpen this:', ...guidance.map((g) => `- ${g.what} — ${g.how}`)].join('\n');
}

function render(
  mode: DigestMode,
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  events: DiagEvent[],
  goal: string,
  windows: WindowAnalysis,
  guidance: SensorGuidance[],
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

  const logStartMs = windows.windows.length > 0 ? windows.windows[0].window.startMs : 0;
  // coverage/time-split/worst in BOTH modes (they are the point of the digest);
  // frame-time + VRAM detail is full-only.
  const evidence = [
    coverageLine(windows),
    timeSplitLine(windows),
    ...(mode === 'full' ? [frameTimesLine(log, stats), vramLine(log, stats)] : []),
  ].filter((l): l is string => l !== null);
  if (evidence.length) {
    parts.push('');
    parts.push(...evidence);
  }
  const worst = worstBlock(windows, logStartMs);
  if (worst) { parts.push(''); parts.push(worst); }

  parts.push('');
  parts.push(eventsBlock(events));

  const g = guidanceBlock(guidance);
  if (g) { parts.push(''); parts.push(g); }

  parts.push('');
  parts.push(`Goal: ${goal}`);

  return parts.join('\n');
}

export function buildDigest(input: {
  log: NormalizedLog;
  stats: Partial<Record<CanonicalKey, Stats>>;
  events: DiagEvent[];
  windows: WindowAnalysis;
  guidance: SensorGuidance[];
  goal?: string;
}): Digest {
  const goal = input.goal ?? DEFAULT_GOAL;
  const compact = render('compact', input.log, input.stats, input.events, goal, input.windows, input.guidance);
  const full = render('full', input.log, input.stats, input.events, goal, input.windows, input.guidance);

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
