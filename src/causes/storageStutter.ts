import type { CanonicalKey, DiagEvent, NormalizedLog, Severity, Stats, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { gameplayMedian, gameplayRowSet, rowsToWindowIndexes, spikeClusters } from './pacing';
import { computeStats } from '../stats/percentiles';
import { windowMax, windowMean } from '../windows/slice';

const ACTIVITY_BURST_FACTOR = 3;
// Relative gates need absolute floors: a near-idle drive's median/p95 is ~0,
// and 3× ~0 would match any blip.
const MIN_ACTIVITY_PCT = 10;
const MIN_READ_RATE_MBPS = 50;

const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function causeStorageStutter(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const ft = log.sensors['pm.frameTimeMs'] ?? log.sensors['rtss.frameTimeMs'];
  const activity = log.sensors['drive.activityPct'];
  const readRate = log.sensors['drive.readRateMbps'];
  if (!ft || (!activity && !readRate) || wa.activityKind !== 'gameplay') return [];

  const rows = gameplayRowSet(wa);
  const clusters = spikeClusters(ft.values, rows);
  if (clusters.length === 0) return [];

  const activityMedian = activity ? gameplayMedian(activity.values, rows) : null;
  const readP95 = readRate
    ? computeStats(readRate.values.map((v, i) => (rows.has(i) ? v : null))).p95
    : null;

  const matched = new Set<number>();
  let matchedClusters = 0;
  for (const c of clusters) {
    let hit = false;
    for (const wi of rowsToWindowIndexes(span(c.startRow, c.endRow), wa.windows)) {
      const w = wa.windows.find((x) => x.window.index === wi);
      if (!w) continue;
      const burst = activity && activityMedian !== null
        && (windowMean(activity.values, w.window) ?? 0)
          > Math.max(ACTIVITY_BURST_FACTOR * activityMedian, MIN_ACTIVITY_PCT);
      const readSpike = readRate && readP95 !== null
        && (windowMax(readRate.values, w.window) ?? 0) > Math.max(readP95, MIN_READ_RATE_MBPS);
      if (burst || readSpike) { matched.add(wi); hit = true; }
    }
    if (hit) matchedClusters++;
  }
  if (matched.size === 0) return [];

  const severity: Severity = matchedClusters >= 2 ? 'warn' : 'info';
  return [makeEvent({
    type: 'storage-stutter',
    severity,
    sentence: `${matchedClusters} of ${clusters.length} frame-time spike ${clusters.length === 1 ? 'cluster' : 'clusters'} lined up with a burst of drive activity — likely asset/shader streaming hitting the drive.`,
    fix: 'Move the game to a faster drive (NVMe SSD) and pause downloads/indexing while playing.',
    sampleCount: matched.size,
    evidence: {
      tier: 'inferred',
      basis: [
        `frame-time spike clusters co-locate with ${activity ? 'drive activity ≥3× its gameplay median' : 'read-rate bursts above the gameplay p95'}`,
        'co-location, not causation — per-frame data would be needed to prove the stall',
      ],
    },
    windowIndexes: [...matched].sort((a, b) => a - b),
  })];
}
