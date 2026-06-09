import type { ColumnMeta, Decimal, FpsData, FpsSource } from '../types';
import { computeStats } from './percentiles';

interface SourcePick { source: FpsSource; label: string; column: ColumnMeta | null; }

// Ordered by preference: Displayed reflects what reached the screen, Presented what the
// engine produced, legacy 'Framerate' is the old single column.
function pickSource(columns: ColumnMeta[]): SourcePick {
  const find = (name: string) => columns.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
  const displayed = find('Framerate Displayed (avg)');
  if (displayed) return { source: 'displayed', label: 'Framerate Displayed (avg)', column: displayed };
  const presented = find('Framerate Presented (avg)');
  if (presented) return { source: 'presented', label: 'Framerate Presented (avg)', column: presented };
  const legacy = find('Framerate');
  if (legacy) return { source: 'legacy', label: 'Framerate', column: legacy };
  return { source: 'none', label: '', column: null };
}

function readColumn(col: ColumnMeta | null, rows: string[][], decimal: Decimal): number[] {
  if (!col) return [];
  const out: number[] = [];
  for (const r of rows) {
    const raw = (r[col.index] ?? '').trim();
    if (raw === '') continue;
    const norm = decimal === ',' ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const n = Number(norm);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// Drop logging artefacts: 0 (legacy column alternates 0->value) and implausible
// wrong-process spikes (> 1000 FPS).
function clean(values: number[]): number[] {
  return values.filter((v) => v > 0 && v <= 1000);
}

function avgOf(values: number[]): number | null {
  const c = clean(values);
  if (c.length === 0) return null;
  return c.reduce((s, v) => s + v, 0) / c.length;
}

const COMMON_CAPS = [30, 60, 72, 90, 100, 120, 141, 144, 160, 165, 175, 180, 200, 240, 360];

function detectCap(cleaned: number[]): { capped: boolean; capValue: number | null } {
  if (cleaned.length < 5) return { capped: false, capValue: null };
  const candidates = new Set<number>(COMMON_CAPS);
  candidates.add(Math.round(Math.max(...cleaned)));
  let best: { value: number; frac: number } | null = null;
  for (const cap of candidates) {
    const within = cleaned.filter((v) => Math.abs(v - cap) <= 1).length;
    const frac = within / cleaned.length;
    if (frac >= 0.8 && (!best || frac > best.frac)) best = { value: cap, frac };
  }
  return best ? { capped: true, capValue: best.value } : { capped: false, capValue: null };
}

export function buildFps(columns: ColumnMeta[], rows: string[][], decimal: Decimal): FpsData {
  const pick = pickSource(columns);

  const presentedCol = columns.find((c) => c.name.toLowerCase() === 'framerate presented (avg)') ?? null;
  const displayedCol = columns.find((c) => c.name.toLowerCase() === 'framerate displayed (avg)') ?? null;
  const presentedAvg = avgOf(readColumn(presentedCol, rows, decimal));
  const displayedAvg = avgOf(readColumn(displayedCol, rows, decimal));

  if (pick.source === 'none' || !pick.column) {
    return {
      source: 'none', sourceLabel: '', clean: [], stats: null,
      presentedAvg, displayedAvg, capped: false, capValue: null,
    };
  }

  const cleaned = clean(readColumn(pick.column, rows, decimal));
  const { capped, capValue } = detectCap(cleaned);

  return {
    source: pick.source,
    sourceLabel: pick.label,
    clean: cleaned,
    stats: computeStats(cleaned),
    presentedAvg,
    displayedAvg,
    capped,
    capValue,
  };
}
