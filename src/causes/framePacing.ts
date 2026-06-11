import type { CanonicalKey, DiagEvent, NormalizedLog, Severity, Stats, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { gameplayRowSet, rowsToWindowIndexes, spikeClusters, spikeRows, stutterIndex } from './pacing';

const WARN_INDEX = 1.8;
const BAD_INDEX = 2.5;
const WARN_CLUSTERS = 3;

const FIX = 'Cap FPS slightly below your average, update GPU drivers, and close recording/overlay apps; if it persists in one game, suspect shader-compilation stutter.';

// HWiNFO frame-time columns are per-poll AVERAGES of many frames, not per-frame data.
// Whatever variability survives that averaging is real and understated — say "sampled",
// never claim per-frame measurements.
const POLL_CAVEAT = 'HWiNFO frame times are per-poll averages — true per-frame spikes are larger than sampled';

export function causeFramePacing(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const pm = log.sensors['pm.frameTimeMs'];
  const source = pm ?? log.sensors['rtss.frameTimeMs'];
  if (!source || wa.activityKind !== 'gameplay') return [];

  const rows = gameplayRowSet(wa);
  const index = stutterIndex(source.values, rows);
  if (index === null) return [];

  const clusters = spikeClusters(source.values, rows);
  if (index < WARN_INDEX && clusters.length < WARN_CLUSTERS) return [];

  const severity: Severity = index >= BAD_INDEX ? 'bad' : 'warn';
  const spikes = spikeRows(source.values, rows);
  const clusterClause = clusters.length > 0
    ? ` with ${clusters.length} sustained spike ${clusters.length === 1 ? 'cluster' : 'clusters'}`
    : '';

  return [makeEvent({
    type: 'stutter',
    subtype: pm ? 'presentmon' : 'rtss',
    severity,
    sentence: `Sampled frame-time variability was high during gameplay (worst 1% of samples ran ${index.toFixed(1)}× the average)${clusterClause} — felt as micro-stutter.`,
    fix: FIX,
    sampleCount: spikes.length,
    evidence: {
      tier: 'measured',
      basis: [
        `${source.label}: gameplay p99/avg ${index.toFixed(2)}, ${clusters.length} spike cluster(s)`,
        POLL_CAVEAT,
      ],
    },
    windowIndexes: rowsToWindowIndexes(spikes, wa.windows),
  })];
}
