import type {
  ColumnMeta, Decimal, NormalizedLog, NumericSensor, FlagSensor,
  CanonicalKey, FlagKey, FpsData, CoreThreadSeries,
} from '../types';
import { findSensor } from './registry';
import { inferSpecs } from './fingerprint';

const NONE_FPS: FpsData = {
  source: 'none', sourceLabel: '', clean: [], stats: null,
  presentedAvg: null, displayedAvg: null, capped: false, capValue: null,
  series: [], presented1PctLow: null, presented01PctLow: null, rtss1PctLow: null,
};

// dGPU section markers (discrete Nvidia/Radeon) vs iGPU section markers (Intel/AMD APU).
const DGPU_ANCHOR = /(12VHPWR|Memory Junction Temperature|Hot Spot Temperature)/i;
const IGPU_ANCHOR = /(VDDCR_GFX|iGPU VID|STAPM|GPU Core Temperature|GPU Total Usage|GPU Utilization)/i;

// Keys that can legitimately appear in both the discrete and integrated GPU blocks.
const AMBIGUOUS = new Set<CanonicalKey>([
  'gpu.temp', 'gpu.clock', 'gpu.clockEff', 'gpu.usage', 'gpu.memUsagePct',
  'vram.allocatedMb', 'vram.availableMb', 'vram.d3dDedicatedMb', 'vram.d3dDynamicMb',
]);
// AMD APUs put 'Throttle Reason - *' in the iGPU block; an all-AMD rig puts them on the dGPU.
const AMBIGUOUS_FLAGS = new Set<FlagKey>([
  'flag.gpu.perfLimitPower', 'flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitCurrent',
]);
const IGPU_FORM: Partial<Record<CanonicalKey, CanonicalKey>> = {
  'gpu.temp': 'igpu.temp',
  'gpu.usage': 'igpu.usage',
};

const CORE_RE = /^(?:(P-core|E-core)|Core)\s+(\d+)\s+T(\d+)\s+(Usage|Effective Clock)$/i;

function parseNumeric(raw: string, decimal: Decimal): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const norm = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function parseFlag(raw: string): boolean {
  return raw.trim().toLowerCase() === 'yes';
}

function timeToMs(t: string): number | null {
  // HWiNFO writes single-digit minutes/seconds when < 10 (e.g. '23:27:0.696'),
  // so accept 1–2 digits for each field.
  const m = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/.exec(t.trim());
  if (!m) return null;
  const [, hh, mm, ss, ms] = m;
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number((ms ?? '0').padEnd(3, '0'));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function nearestAnchorDistance(index: number, anchors: number[]): number {
  if (anchors.length === 0) return Infinity;
  return Math.min(...anchors.map((a) => Math.abs(a - index)));
}

function buildTimesMs(rows: string[][], timeIdx: number): number[] {
  const out: number[] = new Array(rows.length);
  let offset = 0;
  let prevOut = 0;
  let seenAny = false;
  for (let i = 0; i < rows.length; i++) {
    const t = timeToMs(rows[i]?.[timeIdx] ?? '');
    if (t === null) {
      out[i] = prevOut;
      continue;
    }
    if (seenAny && t + offset < prevOut) offset += 24 * 60 * 60 * 1000; // crossed midnight
    prevOut = t + offset;
    out[i] = prevOut;
    seenAny = true;
  }
  return out;
}

// Installed RAM isn't in the trailer, but Used + Available sums to the physical total.
// Take the max over rows (Available shrinks as the OS caches more). Fall back to
// Used / Load% when an Available column isn't logged.
function computeRamMb(columns: ColumnMeta[], rows: string[][], decimal: Decimal): number | null {
  const col = (name: string) => columns.find((c) => c.name.toLowerCase() === name);
  const used = col('physical memory used');
  if (!used) return null;

  const avail = col('physical memory available');
  if (avail) {
    let max = 0;
    for (const r of rows) {
      const u = parseNumeric(r[used.index] ?? '', decimal);
      const a = parseNumeric(r[avail.index] ?? '', decimal);
      if (u != null && a != null) max = Math.max(max, u + a);
    }
    if (max > 0) return Math.round(max);
  }

  const load = col('physical memory load');
  if (load) {
    let max = 0;
    for (const r of rows) {
      const u = parseNumeric(r[used.index] ?? '', decimal);
      const p = parseNumeric(r[load.index] ?? '', decimal);
      if (u != null && p != null && p > 0) max = Math.max(max, (u / p) * 100);
    }
    if (max > 0) return Math.round(max);
  }
  return null;
}

export function normalize(columns: ColumnMeta[], rows: string[][], decimal: Decimal): NormalizedLog {
  const dgpuAnchors = columns.filter((c) => DGPU_ANCHOR.test(c.raw)).map((c) => c.index);
  const igpuAnchors = columns.filter((c) => IGPU_ANCHOR.test(c.raw)).map((c) => c.index);

  const sensors: Partial<Record<CanonicalKey, NumericSensor>> = {};
  const flags: Partial<Record<FlagKey, FlagSensor>> = {};
  const coreUsage: CoreThreadSeries[] = [];
  const coreEffClock: CoreThreadSeries[] = [];
  const unknownColumns: string[] = [];
  const claimed = new Set<CanonicalKey | FlagKey>();
  const timeIdx = columns.find((c) => c.name.toLowerCase() === 'time')?.index ?? 1;

  for (const col of columns) {
    const lname = col.name.toLowerCase();
    if (lname === 'date' || lname === 'time') continue;

    const coreMatch = CORE_RE.exec(col.name);
    if (coreMatch) {
      const [, hybrid, core, thread, kind] = coreMatch;
      const series: CoreThreadSeries = {
        label: `${hybrid ?? 'Core'} ${core} T${thread}`,
        coreType: hybrid ? (hybrid.toUpperCase().startsWith('P') ? 'P' : 'E') : 'std',
        coreIndex: Number(core),
        thread: Number(thread),
        values: rows.map((r) => parseNumeric(r[col.index] ?? '', decimal)),
      };
      (kind.toLowerCase() === 'usage' ? coreUsage : coreEffClock).push(series);
      continue;
    }

    const def = findSensor(col.name, col.unit);
    if (!def) {
      unknownColumns.push(col.raw);
      continue;
    }

    let key: CanonicalKey | FlagKey = def.key;
    const ambiguous = def.kind === 'numeric'
      ? AMBIGUOUS.has(def.key as CanonicalKey)
      : AMBIGUOUS_FLAGS.has(def.key as FlagKey);
    if (ambiguous) {
      const dDist = nearestAnchorDistance(col.index, dgpuAnchors);
      const iDist = nearestAnchorDistance(col.index, igpuAnchors);
      if (iDist < dDist) {
        const igpuForm = def.kind === 'numeric' ? IGPU_FORM[def.key as CanonicalKey] : undefined;
        // An iGPU-section sensor/flag with no canonical iGPU slot is dropped rather
        // than claiming the discrete-GPU key and shadowing it.
        if (!igpuForm) {
          unknownColumns.push(col.raw);
          continue;
        }
        key = igpuForm;
      }
    }

    // First column to claim a key wins (e.g. avoid a later duplicate overwriting it) —
    // except multi:'max' keys, where every matching column folds into a per-row max:
    // a log can carry several drives / VRM rails, and the worst one is the signal.
    if (claimed.has(key)) {
      if (def.kind === 'numeric' && def.multi === 'max') {
        const existing = sensors[key as CanonicalKey]!;
        const incoming = rows.map((r) => parseNumeric(r[col.index] ?? '', decimal));
        existing.values = existing.values.map((a, i) => {
          const b = incoming[i] ?? null;
          if (a === null) return b;
          if (b === null) return a;
          return Math.max(a, b);
        });
      }
      continue;
    }
    claimed.add(key);

    if (def.kind === 'flag') {
      const values = rows.map((r) => parseFlag(r[col.index] ?? ''));
      flags[key as FlagKey] = { key: key as FlagKey, label: def.label, values };
    } else {
      let values = rows.map((r) => parseNumeric(r[col.index] ?? '', decimal));
      // RTSS logs 0 when its stats server isn't armed — that's "missing", not "0 ms".
      if (key === 'rtss.frameTimeMs') values = values.map((v) => (v === 0 ? null : v));
      sensors[key as CanonicalKey] = { key: key as CanonicalKey, label: def.label, unit: def.unit, values };
    }
  }

  const timesMs = buildTimesMs(rows, timeIdx);
  const deltas: number[] = [];
  for (let i = 1; i < timesMs.length; i++) {
    const d = timesMs[i] - timesMs[i - 1];
    if (d > 0) deltas.push(d);
  }
  const pollMs = deltas.length ? median(deltas) : 0;

  if (!claimed.has('cpu.usageCoreMax') && coreUsage.length > 0) {
    const values = rows.map((_, i) => {
      let max: number | null = null;
      for (const s of coreUsage) {
        const v = s.values[i];
        if (v !== null && (max === null || v > max)) max = v;
      }
      return max;
    });
    sensors['cpu.usageCoreMax'] = { key: 'cpu.usageCoreMax', label: 'Max CPU/Thread Usage (derived)', unit: '%', values };
  }

  return {
    rowCount: rows.length,
    pollMs,
    specs: {
      ...inferSpecs(columns.map((c) => c.raw), columns.map((c) => c.source ?? '')),
      ramMb: computeRamMb(columns, rows, decimal),
    },
    sensors,
    flags,
    fps: { ...NONE_FPS },
    unknownColumns,
    timesMs,
    cores: coreUsage.length || coreEffClock.length ? { usage: coreUsage, effectiveClock: coreEffClock } : null,
  };
}
