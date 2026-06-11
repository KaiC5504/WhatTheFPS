import type { AnalysisResult, CanonicalKey, FlagKey, SlimLog, SlimResult } from '../types';

// The persisted form of an AnalysisResult. Everything row-aligned is dropped so 20
// runs fit localStorage; everything the verdict/digest/compare surfaces read survives.
export function slimResult(r: AnalysisResult): SlimResult {
  const sensors: SlimLog['sensors'] = {};
  for (const key of Object.keys(r.log.sensors) as CanonicalKey[]) {
    const s = r.log.sensors[key];
    if (s) sensors[key] = { key: s.key, label: s.label, unit: s.unit, values: [] };
  }

  const flagCounts: SlimLog['flagCounts'] = {};
  for (const key of Object.keys(r.log.flags) as FlagKey[]) {
    const f = r.log.flags[key];
    if (f) flagCounts[key] = { fired: f.values.filter(Boolean).length, total: f.values.length };
  }

  return {
    slim: true,
    log: {
      rowCount: r.log.rowCount,
      pollMs: r.log.pollMs,
      specs: r.log.specs,
      sensors,
      flagCounts,
      fps: { ...r.log.fps, series: [], clean: [] },
      unknownColumns: r.log.unknownColumns,
      timesMs: [],
      cores: null,
    },
    stats: r.stats,
    events: r.events,
    verdict: r.verdict,
    digest: r.digest,
    windows: {
      windows: [],
      timeSplit: r.windows.timeSplit,
      worst: r.windows.worst,
      windowMs: r.windows.windowMs,
      lowConfidence: r.windows.lowConfidence,
      activityKind: r.windows.activityKind,
      logStartMs: r.windows.windows[0]?.window.startMs ?? 0,
    },
    durationMs: r.windows.timeSplit.totalMs,
  };
}
