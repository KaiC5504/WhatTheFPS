import type {
  ColumnMeta, Decimal, NormalizedLog, NumericSensor, FlagSensor,
  CanonicalKey, FlagKey, FpsData,
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
const AMBIGUOUS = new Set<CanonicalKey>(['gpu.temp', 'gpu.clock', 'gpu.clockEff', 'gpu.usage', 'gpu.memUsagePct']);
const IGPU_FORM: Partial<Record<CanonicalKey, CanonicalKey>> = {
  'gpu.temp': 'igpu.temp',
  'gpu.usage': 'igpu.usage',
};

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
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/.exec(t.trim());
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
  const unknownColumns: string[] = [];
  const claimed = new Set<CanonicalKey | FlagKey>();
  const timeIdx = columns.find((c) => c.name.toLowerCase() === 'time')?.index ?? 1;

  for (const col of columns) {
    const lname = col.name.toLowerCase();
    if (lname === 'date' || lname === 'time') continue;

    const def = findSensor(col.name);
    if (!def) {
      unknownColumns.push(col.raw);
      continue;
    }

    let key: CanonicalKey | FlagKey = def.key;
    if (def.kind === 'numeric' && AMBIGUOUS.has(def.key as CanonicalKey)) {
      const dDist = nearestAnchorDistance(col.index, dgpuAnchors);
      const iDist = nearestAnchorDistance(col.index, igpuAnchors);
      if (iDist < dDist) {
        const igpuForm = IGPU_FORM[def.key as CanonicalKey];
        // An iGPU-section sensor with no canonical iGPU slot (e.g. iGPU clock) is
        // dropped rather than claiming the discrete-GPU key and shadowing it.
        if (!igpuForm) {
          unknownColumns.push(col.raw);
          continue;
        }
        key = igpuForm;
      }
    }

    // First column to claim a key wins (e.g. avoid a later duplicate overwriting it).
    if (claimed.has(key)) continue;
    claimed.add(key);

    if (def.kind === 'flag') {
      const values = rows.map((r) => parseFlag(r[col.index] ?? ''));
      flags[key as FlagKey] = { key: key as FlagKey, label: def.label, values };
    } else {
      const values = rows.map((r) => parseNumeric(r[col.index] ?? '', decimal));
      sensors[key as CanonicalKey] = { key: key as CanonicalKey, label: def.label, unit: def.unit, values };
    }
  }

  const times = rows.map((r) => timeToMs(r[timeIdx] ?? '')).filter((t): t is number => t !== null);
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    let d = times[i] - times[i - 1];
    if (d < 0) d += 24 * 60 * 60 * 1000; // crossed midnight
    if (d > 0) deltas.push(d);
  }
  const pollMs = deltas.length ? median(deltas) : 0;

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
    timesMs: [],
    cores: null,
  };
}
