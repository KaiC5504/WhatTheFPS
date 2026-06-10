import type { Limiter, NormalizedLog, WindowAnalysis, WindowClassification } from '../types';
import { buildGrid } from './grid';
import { buildMetrics } from './slice';
import { segmentActivity } from './segment';
import { classifyLimiter } from './classify';
import { buildTimeSplit, pickWorst } from './aggregate';

const GAMEPLAY_SHARE = 0.2; // below this fraction of gameplay windows, the log is a workload

export function buildWindowAnalysis(log: NormalizedLog): WindowAnalysis {
  const { windows, windowMs, lowConfidence } = buildGrid(log.timesMs, log.pollMs);
  const fpsAvailable = log.fps.source !== 'none';

  const metrics = windows.map((w) => buildMetrics(log, w));
  const activities = segmentActivity(metrics, fpsAvailable);
  const cap = { capped: log.fps.capped, capValue: log.fps.capValue };

  const classified: WindowClassification[] = windows.map((w, i) => {
    const call = activities[i] === 'gameplay'
      ? classifyLimiter(metrics[i], cap)
      : { limiter: 'unknown' as Limiter, tier: null, basis: [] };
    return { window: w, activity: activities[i], metrics: metrics[i], ...call };
  });

  // A log only counts as gameplay if a real fraction of it is actual gameplay. A CPU
  // benchmark logs a token render framerate (a few fps), so an FPS column alone isn't
  // enough — that's a workload, and narrating it as "gameplay" would be dishonest.
  const gameplayWindows = classified.filter((w) => w.activity === 'gameplay').length;
  const activityKind = fpsAvailable && gameplayWindows >= windows.length * GAMEPLAY_SHARE
    ? 'gameplay'
    : 'workload';

  return {
    windows: classified,
    timeSplit: buildTimeSplit(classified),
    worst: pickWorst(classified),
    windowMs,
    lowConfidence,
    activityKind,
  };
}
