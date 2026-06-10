import type { CanonicalKey, DiagEvent, NormalizedLog, Stats, WindowAnalysis, WindowClassification } from '../types';
import { makeEvent } from './events';
import { dedupe, majorityTier } from './shared';
import { windowMean } from '../windows/slice';

const SHARE_NOTABLE = 0.15;
const SHARE_DOMINANT = 0.4;
const PINNED_CORE_PCT = 95;
const MODERATE_TOTAL_PCT = 60;
const PINNED_MIN_WINDOWS = 2;
const NAMED_THREAD_MIN_PCT = 90;
const FIX =
  'A faster CPU/RAM, lower in-game settings that lean on the CPU, or a higher resolution (to shift load to the GPU) can help.';

function hottestThread(log: NormalizedLog, windows: WindowClassification[]): string | null {
  if (!log.cores || log.cores.usage.length === 0) return null;
  let best: { label: string; mean: number } | null = null;
  for (const series of log.cores.usage) {
    let sum = 0, n = 0;
    for (const w of windows) {
      const v = windowMean(series.values, w.window);
      if (v !== null) { sum += v; n++; }
    }
    if (n === 0) continue;
    const mean = sum / n;
    if (!best || mean > best.mean) best = { label: series.label, mean };
  }
  return best && best.mean >= NAMED_THREAD_MIN_PCT ? best.label : null;
}

export function causeCpuBound(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const events: DiagEvent[] = [];
  const word = wa.activityKind === 'gameplay' ? 'gameplay' : 'the active workload';

  const cpuWindows = wa.windows.filter((w) => w.activity === 'gameplay' && w.limiter === 'cpu');
  const share = wa.timeSplit.shares.cpu ?? 0;
  if (share >= SHARE_NOTABLE && cpuWindows.length > 0) {
    const tier = majorityTier(cpuWindows);
    const pct = Math.round(share * 100);
    events.push(makeEvent({
      type: 'cpu-bottleneck',
      severity: share >= SHARE_DOMINANT ? 'warn' : 'info',
      sentence: tier === 'measured'
        ? `The CPU held the GPU back for ${pct}% of ${word} — the GPU sat idle waiting for frames.`
        : `The CPU likely held the GPU back for ${pct}% of ${word}.`,
      fix: FIX,
      sampleCount: cpuWindows.length,
      evidence: { tier, basis: dedupe(cpuWindows.flatMap((w) => w.basis)).slice(0, 3) },
      windowIndexes: cpuWindows.map((w) => w.window.index),
    }));
  }

  const pinned = wa.windows.filter((w) =>
    w.activity === 'gameplay'
    && w.metrics.cpuMaxThread !== null && w.metrics.cpuMaxThread >= PINNED_CORE_PCT
    && w.metrics.cpuTotal !== null && w.metrics.cpuTotal <= MODERATE_TOTAL_PCT);
  if (pinned.length >= PINNED_MIN_WINDOWS) {
    const thread = hottestThread(log, pinned);
    const maxPct = Math.round(Math.max(...pinned.map((w) => w.metrics.cpuMaxThread as number)));
    const totalAvg = Math.round(pinned.reduce((s, w) => s + (w.metrics.cpuTotal as number), 0) / pinned.length);
    events.push(makeEvent({
      type: 'cpu-bottleneck-core',
      severity: 'warn',
      sentence: `One CPU thread${thread ? ` (${thread})` : ''} ran at ${maxPct}% while total CPU usage stayed around ${totalAvg}% — a single-thread ceiling.`,
      fix: FIX,
      sampleCount: pinned.length,
      evidence: {
        tier: 'inferred',
        basis: [`${pinned.length} windows with one thread ≥ ${PINNED_CORE_PCT}% and total CPU ≤ ${MODERATE_TOTAL_PCT}%`],
      },
      windowIndexes: pinned.map((w) => w.window.index),
    }));
  }

  return events;
}
