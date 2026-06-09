import type { NormalizedLog, CanonicalKey, Stats, DiagEvent } from '../types';
import { makeEvent } from './events';

const GPU_STARVED_AVG = 90;
const PINNED_CORE_PCT = 95;
const MODERATE_TOTAL_PCT = 60;
const FIX =
  'A faster CPU/RAM, lower in-game settings that lean on the CPU, or a higher resolution (to shift load to the GPU) can help.';

function flagDensity(log: NormalizedLog, key: 'flag.gpu.perfLimitUtil'): number {
  const flag = log.flags[key];
  if (!flag || flag.values.length === 0) return 0;
  let n = 0;
  for (const v of flag.values) if (v) n++;
  return n / flag.values.length;
}

export function detectCpuBottleneck(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  const gpuUsage = stats['gpu.usage'];
  const utilLimited = flagDensity(log, 'flag.gpu.perfLimitUtil') >= 0.5;
  const gpuStarved = gpuUsage !== undefined && gpuUsage.count > 0 && gpuUsage.avg < GPU_STARVED_AVG;

  if (gpuStarved || (utilLimited && gpuUsage !== undefined && gpuUsage.count > 0)) {
    const avg = Math.round(gpuUsage!.avg);
    const sentence = `GPU averaged ${avg}% usage — the CPU is likely holding it back.`;
    events.push(makeEvent({ type: 'cpu-bottleneck', severity: 'warn', sentence, fix: FIX, sampleCount: gpuUsage!.count }));
  }

  const total = stats['cpu.usageTotal'];
  const coreMax = stats['cpu.usageCoreMax'];
  if (
    coreMax !== undefined && coreMax.count > 0 && coreMax.max >= PINNED_CORE_PCT &&
    total !== undefined && total.count > 0 && total.avg <= MODERATE_TOTAL_PCT
  ) {
    const sentence = `One CPU core hit ${Math.round(coreMax.max)}% while total CPU usage stayed around ${Math.round(total.avg)}% — a single-thread bottleneck.`;
    events.push(makeEvent({ type: 'cpu-bottleneck-core', severity: 'warn', sentence, fix: FIX, sampleCount: coreMax.count }));
  }

  return events;
}
