import type { AnalysisResult, CanonicalKey, DiagEvent, Stats } from '../types';
import { decodeBytes } from '../parsing/decode';
import { parseCsv } from '../parsing/csv';
import { buildColumns } from '../parsing/columns';
import { normalize } from '../sensors/normalize';
import { buildFps } from '../stats/fps';
import { computeStats } from '../stats/percentiles';
import { buildWindowAnalysis } from '../windows';
import { causeThermalCollapse } from '../causes/thermalCollapse';
import { causeFpsCap } from '../causes/fpsCap';
import { causeCpuBound } from '../causes/cpuBound';
import { causeGpuBound } from '../causes/gpuBound';
import { causeVramPressure } from '../causes/vramPressure';
import { causeRamPressure } from '../causes/ramPressure';
import { causeHotspotDelta } from '../causes/hotspotDelta';
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

  const windows = buildWindowAnalysis(log);

  // Cause analyzers consume the windowed analysis (and run after fps is populated).
  const events: DiagEvent[] = [
    ...causeThermalCollapse(log, stats, windows),
    ...causeFpsCap(log, stats, windows),
    ...causeCpuBound(log, stats, windows),
    ...causeGpuBound(log, stats, windows),
    ...causeVramPressure(log, stats, windows),
    ...causeRamPressure(log, stats, windows),
    ...causeHotspotDelta(log, stats, windows),
  ];

  const verdict = buildVerdict(log, stats, events, windows);
  const digest = buildDigest({ log, stats, events, goal: opts.goal });

  return { log, stats, events, verdict, digest, windows };
}
