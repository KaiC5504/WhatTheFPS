import type { ColumnMeta } from '../types';

// Trailing '[...]' is the unit; anything else (incl. parenthesised qualifiers) is the name.
const UNIT_RE = /^(.*?)\s*\[([^\]]*)\]\s*$/;

export function buildColumns(headers: string[], sources: string[] = []): ColumnMeta[] {
  const seen = new Map<string, number>();
  return headers.map((raw, index) => {
    const m = UNIT_RE.exec(raw);
    const name = (m ? m[1] : raw).trim();
    const unit = m ? m[2] : null;
    const dupIndex = seen.get(name) ?? 0;
    seen.set(name, dupIndex + 1);
    const source = sources[index]?.trim() || null;
    return { raw, name, unit, index, dupIndex, source };
  });
}
