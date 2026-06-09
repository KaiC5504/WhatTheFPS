import type { AnalysisResult, CanonicalKey, DiagEvent, Stats } from '../types';
import { decodeBytes } from '../parsing/decode';
import { parseCsv } from '../parsing/csv';
import { buildColumns } from '../parsing/columns';
import { normalize } from '../sensors/normalize';
import { buildFps } from '../stats/fps';
import { computeStats } from '../stats/percentiles';
import { detectThrottling } from '../detect/throttling';
import { detectFpsCap } from '../detect/fpsCap';
import { detectCpuBottleneck } from '../detect/cpuBottleneck';
import { detectPowerHotspotRam } from '../detect/powerHotspotRam';
import { buildVerdict } from '../verdict/buildVerdict';
import { buildDigest } from '../digest/digest';

export interface AnalyzeOptions {
  goal?: string;
}

// The single seam where the ingest pipeline and the analysis stack meet.
export function analyze(bytes: Uint8Array, opts: AnalyzeOptions = {}): AnalysisResult {
  const parsed = parseCsv(decodeBytes(bytes));
  const columns = buildColumns(parsed.headers, parsed.sources);

  const log = normalize(columns, parsed.rows, parsed.decimal);
  // normalize() leaves fps as a none-placeholder; the FPS pipeline is wired here.
  log.fps = buildFps(columns, parsed.rows, parsed.decimal);

  const stats: Partial<Record<CanonicalKey, Stats>> = {};
  for (const key of Object.keys(log.sensors) as CanonicalKey[]) {
    const sensor = log.sensors[key];
    if (sensor) stats[key] = computeStats(sensor.values);
  }

  // Detectors run after fps is populated (detectFpsCap reads log.fps).
  const events: DiagEvent[] = [
    ...detectThrottling(log, stats),
    ...detectFpsCap(log, stats),
    ...detectCpuBottleneck(log, stats),
    ...detectPowerHotspotRam(log, stats),
  ];

  const verdict = buildVerdict(log, stats, events);
  const digest = buildDigest({ log, stats, events, goal: opts.goal });

  return { log, stats, events, verdict, digest };
}
