import type { NormalizedLog, CanonicalKey, FlagKey, Stats, DiagEvent } from '../types';
import { makeEvent } from './events';

const HEADROOM_FIX =
  'Try undervolting the GPU or lowering its power limit — at a capped framerate this runs cooler and quieter for free.';

const GPU_PINNED_PCT = 95;

function flagDensity(log: NormalizedLog, key: FlagKey): number {
  const flag = log.flags[key];
  if (!flag || flag.values.length === 0) return 0;
  let n = 0;
  for (const v of flag.values) if (v) n++;
  return n / flag.values.length;
}

export function detectFpsCap(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
): DiagEvent[] {
  const { fps } = log;
  if (!fps.capped || fps.capValue === null) return [];

  const gpuUsage = stats['gpu.usage'];
  const gpuPinned = gpuUsage !== undefined && gpuUsage.count > 0 && gpuUsage.avg >= GPU_PINNED_PCT;
  const thermalLimited = flagDensity(log, 'flag.gpu.perfLimitThermal') >= 0.2;
  const powerLimited = flagDensity(log, 'flag.gpu.perfLimitPower') >= 0.2;

  const cap = Math.round(fps.capValue);
  const hasHeadroom = !gpuPinned && !thermalLimited && !powerLimited;

  if (hasHeadroom) {
    const sentence = `FPS is capped at ~${cap} and the GPU still has thermal/power headroom — you can run cooler without losing frames.`;
    return [makeEvent({ type: 'fps-cap', severity: 'info', sentence, fix: HEADROOM_FIX, sampleCount: fps.clean.length })];
  }

  // Capped but the GPU is already working hard — note the cap without the headroom claim.
  const sentence = `FPS is capped at ~${cap}.`;
  return [makeEvent({ type: 'fps-cap', severity: 'info', sentence, sampleCount: fps.clean.length })];
}
