import type { CanonicalKey, DiagEvent, FlagKey, NormalizedLog, Stats, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { countTrue } from './shared';

const SHARE_NOTABLE = 0.4;     // GPU-bound is the expected state; only narrate when dominant
const FLAG_SUBSHARE = 0.3;     // fraction of gpu-bound windows where a limiter flag fired
const UNDERUTIL_SHARE = 0.2;

export function causeGpuBound(
  _log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const events: DiagEvent[] = [];
  const word = wa.activityKind === 'gameplay' ? 'gameplay' : 'the active workload';

  const gpuWindows = wa.windows.filter((w) => w.activity === 'gameplay' && w.limiter === 'gpu');
  const share = wa.timeSplit.shares.gpu ?? 0;

  if (gpuWindows.length > 0 && share >= SHARE_NOTABLE) {
    const subshare = (k: FlagKey) =>
      countTrue(gpuWindows.map((w) => w.metrics.flagsFired.includes(k))) / gpuWindows.length;
    const thermal = subshare('flag.gpu.perfLimitThermal');
    const power = subshare('flag.gpu.perfLimitPower');
    const voltage = Math.max(subshare('flag.gpu.perfLimitVRel'), subshare('flag.gpu.perfLimitVOp'));
    const pct = Math.round(share * 100);
    const indexes = gpuWindows.map((w) => w.window.index);
    const count = gpuWindows.length;

    if (thermal >= FLAG_SUBSHARE) {
      events.push(makeEvent({
        type: 'gpu-bound', severity: 'warn',
        sentence: `GPU-bound for ${pct}% of ${word} and thermally limited in ${Math.round(thermal * 100)}% of that time — cooling is costing you frames.`,
        fix: 'Improve GPU cooling (fan curve, dust, pads) or undervolt — thermal limiting means free performance is on the table.',
        sampleCount: count,
        evidence: { tier: 'measured', basis: [`GPU thermal-limit flag latched in ${Math.round(thermal * 100)}% of GPU-bound windows`] },
        windowIndexes: indexes,
      }));
    } else if (power >= FLAG_SUBSHARE) {
      events.push(makeEvent({
        type: 'gpu-bound', severity: 'info',
        sentence: `GPU-bound for ${pct}% of ${word}, hitting its power limit ${Math.round(power * 100)}% of that time — it's giving everything the board allows.`,
        fix: 'Raise the GPU power limit if cooling allows, or undervolt to get more clocks inside the same power budget.',
        sampleCount: count,
        evidence: { tier: 'measured', basis: [`GPU power-limit flag latched in ${Math.round(power * 100)}% of GPU-bound windows`] },
        windowIndexes: indexes,
      }));
    } else if (voltage >= FLAG_SUBSHARE) {
      events.push(makeEvent({
        type: 'gpu-bound', severity: 'info',
        sentence: `GPU-bound for ${pct}% of ${word} at its voltage ceiling — normal boost behavior, the card is simply at full tilt.`,
        sampleCount: count,
        evidence: { tier: 'measured', basis: ['GPU voltage-limit flags latched during GPU-bound windows'] },
        windowIndexes: indexes,
      }));
    } else {
      events.push(makeEvent({
        type: 'gpu-bound', severity: 'info',
        sentence: `GPU-bound for ${pct}% of ${word} — fully busy on rendering. Lower settings/resolution or a faster GPU is the lever.`,
        sampleCount: count,
        evidence: { tier: gpuWindows.some((w) => w.tier === 'measured') ? 'measured' : 'inferred', basis: gpuWindows[0].basis },
        windowIndexes: indexes,
      }));
    }
  }

  const underWindows = wa.windows.filter((w) => w.activity === 'gameplay' && w.limiter === 'underutilized');
  const uShare = wa.timeSplit.shares.underutilized ?? 0;
  if (underWindows.length > 0 && uShare >= UNDERUTIL_SHARE) {
    events.push(makeEvent({
      type: 'gpu-underutilized', severity: 'warn',
      sentence: `The GPU looked busy but drew far less power than its limit for ${Math.round(uShare * 100)}% of ${word} — an engine or driver bottleneck, not raw GPU speed.`,
      fix: 'Check for driver updates, in-game frame pacing options, or known engine issues with this title.',
      sampleCount: underWindows.length,
      evidence: { tier: 'measured', basis: underWindows[0].basis },
      windowIndexes: underWindows.map((w) => w.window.index),
    }));
  }

  return events;
}
