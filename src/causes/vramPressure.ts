import type { CanonicalKey, DiagEvent, NormalizedLog, Stats, WindowAnalysis, WindowClassification } from '../types';
import { makeEvent } from './events';
import { medianLower } from '../stats/percentiles';

const CAPACITY_NEAR_FRAC = 0.9;
const NEAR_FULL_FRAC = 0.95;
const SPILL_RISE_MB = 200;
const VRAM_FT_SPIKE_FACTOR = 2.5;
const SPIKE_MIN_WINDOWS = 2;

function vramCapacityMb(log: NormalizedLog): number | null {
  const alloc = log.sensors['vram.allocatedMb']?.values;
  const avail = log.sensors['vram.availableMb']?.values;
  if (!alloc || !avail) return null;
  let max = 0;
  const len = Math.min(alloc.length, avail.length);
  for (let i = 0; i < len; i++) {
    const a = alloc[i], b = avail[i];
    if (a !== null && b !== null) max = Math.max(max, a + b);
  }
  return max > 0 ? Math.round(max) : null;
}

function spillRising(wa: WindowAnalysis): boolean {
  const gameplay = wa.windows.filter((w) => w.activity === 'gameplay' && w.metrics.vramDynamicMb !== null);
  if (gameplay.length < 4) return false;
  const q = Math.max(1, Math.floor(gameplay.length / 4));
  const mean = (ws: WindowClassification[]) =>
    ws.reduce((s, w) => s + (w.metrics.vramDynamicMb as number), 0) / ws.length;
  return mean(gameplay.slice(-q)) - mean(gameplay.slice(0, q)) >= SPILL_RISE_MB;
}

function spikeWindows(wa: WindowAnalysis): WindowClassification[] {
  const gameplay = wa.windows.filter((w) => w.activity === 'gameplay' && w.metrics.frameTimeMs !== null);
  if (gameplay.length === 0) return [];
  const fts = gameplay.map((w) => w.metrics.frameTimeMs as number).sort((a, b) => a - b);
  const median = medianLower(fts);
  return gameplay.filter((w) => w.metrics.frameTimeMaxMs !== null && w.metrics.frameTimeMaxMs >= VRAM_FT_SPIKE_FACTOR * median);
}

export function causeVramPressure(
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const capacity = vramCapacityMb(log);
  const dedicated = stats['vram.d3dDedicatedMb'];
  if (capacity === null || !dedicated || dedicated.count === 0) return [];

  const fillFrac = dedicated.p95 / capacity;
  if (fillFrac < CAPACITY_NEAR_FRAC) return [];

  const headroom = Math.max(0, Math.round(capacity - dedicated.p95));
  const spikes = spikeWindows(wa);
  const hasFrametime = wa.windows.some((w) => w.metrics.frameTimeMs !== null);

  if (hasFrametime && spikes.length >= SPIKE_MIN_WINDOWS && spillRising(wa)) {
    return [makeEvent({
      type: 'vram-pressure', severity: 'warn',
      sentence: `VRAM is effectively full (~${headroom} MB headroom of ${capacity} MB) and textures are spilling to system RAM — the frametime spikes line up with it.`,
      fix: 'Lower texture quality/resolution one notch, or close other GPU-using apps (browsers with hardware acceleration count).',
      sampleCount: spikes.length,
      evidence: {
        tier: 'inferred',
        basis: [
          `D3D dedicated p95 ${Math.round(dedicated.p95)} MB of ${capacity} MB capacity`,
          `dynamic (spilled) VRAM rose ≥ ${SPILL_RISE_MB} MB over the session`,
          `${spikes.length} windows with frametime spikes ≥ ${VRAM_FT_SPIKE_FACTOR}× the median`,
        ],
      },
      windowIndexes: spikes.map((w) => w.window.index),
    })];
  }

  if (fillFrac >= NEAR_FULL_FRAC) {
    return [makeEvent({
      type: 'vram-pressure', severity: 'info',
      sentence: `VRAM is nearly full (~${headroom} MB headroom of ${capacity} MB). Can't confirm stutter without frametime data.`,
      fix: 'Lower texture quality one notch if you see hitching.',
      sampleCount: dedicated.count,
      evidence: {
        tier: 'inferred',
        basis: [`D3D dedicated p95 ${Math.round(dedicated.p95)} MB of ${capacity} MB capacity`],
        missing: [{ what: 'frametime data', how: 'Enable the PresentMon sensors in HWiNFO (7.63+) or run RTSS while logging.' }],
      },
    })];
  }
  return [];
}
