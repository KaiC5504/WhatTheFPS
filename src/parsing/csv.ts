import type { ParsedCsv, Delimiter, Decimal } from '../types';

const DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{4}$/; // HWiNFO row date, e.g. 7.6.2026

function detectDelimiter(headerLine: string): Delimiter {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas++;
    else if (!inQuotes && ch === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

function tokenize(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

// HWiNFO appends a trailing delimiter, producing one empty cell at the end of every line.
function dropTrailingEmpty(cells: string[]): string[] {
  if (cells.length > 1 && cells[cells.length - 1] === '') return cells.slice(0, -1);
  return cells;
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/);
  let headerLine = '';
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      headerLine = lines[i];
      headerIdx = i;
      break;
    }
  }

  const delimiter = detectDelimiter(headerLine);
  const decimal: Decimal = delimiter === ';' ? ',' : '.';

  const headers = dropTrailingEmpty(tokenize(headerLine, delimiter));

  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const cells = dropTrailingEmpty(tokenize(line, delimiter));
    if (!DATE_RE.test(cells[0])) continue; // footer/summary rows (Average/Minimum/...) skipped
    rows.push(cells);
  }

  return { headers, rows, delimiter, decimal };
}
