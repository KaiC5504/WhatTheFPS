import type { DeltaDirection, SensorDelta } from '../types';

export function fmtSide(v: number | null, unit: string | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  if (unit === null) return text;
  return unit === '%' || unit === '°C' ? `${text}${unit}` : `${text} ${unit}`;
}

export function fmtDelta(d: SensorDelta): string {
  if (d.delta === null || !Number.isFinite(d.delta)) return '—';
  return `${d.delta >= 0 ? '+' : '-'}${fmtSide(Math.abs(d.delta), d.unit)}`;
}

export const DIR_ARROW: Record<DeltaDirection, string> = { up: '↑', down: '↓', flat: '→' };

// Color rides on the row class so CSS can scope it to the Δ cell only.
export function deltaRowClass(d: SensorDelta): string {
  if (d.polarity === 'improved') return 'delta--improved';
  if (d.polarity === 'worse') return 'delta--worse';
  return '';
}

export function fmtTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
