import type { CanonicalKey, DiagEvent, NormalizedLog, Stats, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { medianLower } from '../stats/percentiles';

const RAM_P95_PCT = 90;
const PAGEFILE_P95_PCT = 80;
const RAM_WINDOW_HIGH_PCT = 90;
const RAM_FT_SPIKE_FACTOR = 2.5;

export function causeRamPressure(
  _log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const ramLoad = stats['ram.loadPct'];
  const pagefile = stats['pagefile.usagePct'];
  const ramHigh = ramLoad !== undefined && ramLoad.count > 0 && ramLoad.p95 > RAM_P95_PCT;
  const pageHigh = pagefile !== undefined && pagefile.count > 0 && pagefile.p95 > PAGEFILE_P95_PCT;
  if (!ramHigh && !pageHigh) return [];

  const pct = ramHigh ? Math.round(ramLoad!.p95) : Math.round(pagefile!.p95);
  const what = ramHigh ? 'Memory' : 'The pagefile';

  const hasFrametime = wa.windows.some((w) => w.metrics.frameTimeMs !== null);
  const gameplay = wa.windows.filter((w) => w.activity === 'gameplay' && w.metrics.frameTimeMs !== null);
  const fts = gameplay.map((w) => w.metrics.frameTimeMs as number).sort((a, b) => a - b);
  const median = fts.length ? medianLower(fts) : null;
  const colocated = median !== null && gameplay.some((w) =>
    w.metrics.ramLoadPct !== null && w.metrics.ramLoadPct >= RAM_WINDOW_HIGH_PCT
    && w.metrics.frameTimeMaxMs !== null && w.metrics.frameTimeMaxMs >= RAM_FT_SPIKE_FACTOR * median);

  const severity = !hasFrametime || colocated ? 'warn' : 'info';

  return [makeEvent({
    type: 'ram-pressure',
    severity,
    sentence: `${what} was ~${pct}% full at peak — close background apps or add more RAM.`,
    fix: 'Close memory-heavy background apps, or add RAM if this happens under your normal workload.',
    sampleCount: ramHigh ? ramLoad!.count : pagefile!.count,
    evidence: {
      tier: 'inferred',
      basis: [
        `${ramHigh ? 'RAM load' : 'pagefile usage'} p95 ${pct}%`,
        ...(colocated ? ['frametime spikes co-locate with high-RAM windows'] : []),
      ],
    },
  })];
}
