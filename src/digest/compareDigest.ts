import type { Comparison, DiagEvent, Digest, DigestMode, SavedRun, SensorDelta, TimeSplit } from '../types';

const DEFAULT_GOAL = 'did this change help, and what else can I tune?';

function n(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmt(v: number | null, unit: string | null): string {
  if (v === null) return '—';
  if (unit === null) return n(v);
  return unit === '%' || unit === '°C' ? `${n(v)}${unit}` : `${n(v)} ${unit}`;
}

const POLARITY_TAG: Record<SensorDelta['polarity'], string> = {
  improved: ' [better]', worse: ' [worse]', neutral: '', unknown: '',
};

function deltaLine(d: SensorDelta): string {
  if (d.before === null || d.after === null || d.delta === null) {
    return `- ${d.label}: ${fmt(d.before, d.unit)} → ${fmt(d.after, d.unit)} (one side missing)`;
  }
  const sign = d.delta >= 0 ? '+' : '-';
  return `- ${d.label}: ${fmt(d.before, d.unit)} → ${fmt(d.after, d.unit)} (${sign}${fmt(Math.abs(d.delta), d.unit)})${POLARITY_TAG[d.polarity]}`;
}

function when(run: SavedRun): string {
  const d = new Date(run.createdAt);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventLine(title: string, events: DiagEvent[]): string {
  if (events.length === 0) return `- ${title}: none`;
  return `- ${title}: ${events.map((e) => e.sentence).join(' | ')}`;
}

function splitSummary(label: string, split: TimeSplit): string {
  if (split.dominant === null) return `${label} no active windows`;
  const pct = (k: 'gpu' | 'cpu' | 'capped') => Math.round((split.shares[k] ?? 0) * 100);
  return `${label} dominant ${split.dominant} (gpu ${pct('gpu')}%, cpu ${pct('cpu')}%, capped ${pct('capped')}%)`;
}

// Each stored digest ends with its own "Goal:" line; the compare goal replaces them.
function stripGoal(digest: string): string {
  return digest.replace(/\n+Goal: [^\n]*\s*$/, '');
}

function render(mode: DigestMode, before: SavedRun, after: SavedRun, c: Comparison, goal: string): string {
  const parts: string[] = [];
  parts.push('HWiNFO before/after comparison:');
  parts.push('');
  parts.push(`BEFORE: ${before.name} (saved ${when(before)})`);
  parts.push(`AFTER: ${after.name} (saved ${when(after)})`);
  parts.push('');
  parts.push(`Verdict: ${c.headline}`);
  parts.push('');
  parts.push('Hero deltas (before → after):');
  parts.push(...c.heroDeltas.map(deltaLine));
  parts.push('');
  parts.push('Events:');
  parts.push(eventLine('resolved (gone in AFTER)', c.eventDiff.resolved));
  parts.push(eventLine('introduced (new in AFTER)', c.eventDiff.introduced));
  parts.push(eventLine('persisted (in both)', c.eventDiff.persisted));
  parts.push('');
  parts.push(
    `Time split: ${splitSummary('BEFORE', c.timeSplitDelta.before)}; ${splitSummary('AFTER', c.timeSplitDelta.after)}${c.timeSplitDelta.dominantChanged ? ' — the limiter moved between runs' : ''}`,
  );
  parts.push('');
  parts.push('Caveats:');
  parts.push(...c.mismatches.map((m) => `- ${m.message}`));
  parts.push(`- ${c.caveat}`);

  if (mode === 'full') {
    const significant = c.sensorDeltas.filter((d) => d.delta !== null && d.direction !== 'flat');
    if (significant.length > 0) {
      parts.push('');
      parts.push('All significant deltas:');
      parts.push(...significant.map(deltaLine));
    }
  }

  parts.push('');
  parts.push(`=== BEFORE: ${before.name} ===`);
  parts.push(stripGoal(mode === 'full' ? before.result.digest.full : before.result.digest.compact));
  parts.push('');
  parts.push(`=== AFTER: ${after.name} ===`);
  parts.push(stripGoal(mode === 'full' ? after.result.digest.full : after.result.digest.compact));
  parts.push('');
  parts.push(`Goal: ${goal}`);
  return parts.join('\n');
}

export function buildCompareDigest(
  before: SavedRun,
  after: SavedRun,
  comparison: Comparison,
  opts?: { goal?: string },
): Digest {
  const goal = opts?.goal ?? DEFAULT_GOAL;
  const compact = render('compact', before, after, comparison, goal);
  const full = render('full', before, after, comparison, goal);
  return {
    compact,
    full,
    tokenEstimate: {
      compact: Math.ceil(compact.length / 4),
      full: Math.ceil(full.length / 4),
    } as Record<DigestMode, number>,
    fpsSourceLabel: after.result.digest.fpsSourceLabel || before.result.digest.fpsSourceLabel,
  };
}
