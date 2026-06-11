export const DECIMATE_THRESHOLD = 20_000;
export const DECIMATE_TARGET = 4_000;

function firstOfRun(timesMs: number[], row: number): number {
  while (row > 0 && timesMs[row - 1] === timesMs[row]) row--;
  return row;
}

// Nearest row for a time, by binary search over the (non-decreasing) timesMs.
// Forward-filled duplicate runs — HWiNFO repeats the timestamp when logging
// pauses — always resolve to the FIRST index of the run, so a selection edge
// can't land arbitrarily inside one. Ties between neighbors resolve low.
export function timeToRow(timesMs: number[], tMs: number): number {
  const n = timesMs.length;
  if (n === 0) return 0;
  if (tMs <= timesMs[0]) return 0;
  if (tMs >= timesMs[n - 1]) return firstOfRun(timesMs, n - 1);

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timesMs[mid] <= tMs) lo = mid;
    else hi = mid;
  }
  const row = tMs - timesMs[lo] <= timesMs[hi] - tMs ? lo : hi;
  return firstOfRun(timesMs, row);
}

// Min/max bucket decimation over row indexes, shared by every plotted series
// (uPlot aligned data needs one common x). Each bucket keeps, per series, the
// rows holding its min and max (spikes survive) plus one null row if the
// bucket has a gap (line breaks survive). Logs at or under the threshold pass
// through untouched — at HWiNFO's usual 2 s poll that is ~11 hours.
export function decimateRows(
  rowCount: number,
  series: ((number | null)[] | undefined)[],
  threshold = DECIMATE_THRESHOLD,
  target = DECIMATE_TARGET,
): number[] {
  if (rowCount <= threshold) return Array.from({ length: rowCount }, (_, i) => i);

  const present = series.filter((s): s is (number | null)[] => !!s && s.length > 0);
  // ≤3 kept rows per series per bucket (min, max, one null) bounds the output
  const perBucket = 3 * Math.max(present.length, 1);
  const buckets = Math.max(1, Math.floor(target / perBucket));
  const size = rowCount / buckets;
  const keep = new Set<number>();

  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(Math.floor((b + 1) * size), rowCount);
    if (present.length === 0) {
      keep.add(from);
      continue;
    }
    for (const s of present) {
      let minI = -1;
      let maxI = -1;
      let nullI = -1;
      for (let i = from; i < to; i++) {
        const v = s[i];
        if (v === null || !Number.isFinite(v)) {
          if (nullI === -1) nullI = i;
          continue;
        }
        if (minI === -1 || v < (s[minI] as number)) minI = i;
        if (maxI === -1 || v > (s[maxI] as number)) maxI = i;
      }
      if (minI !== -1) keep.add(minI);
      if (maxI !== -1) keep.add(maxI);
      if (nullI !== -1) keep.add(nullI);
    }
  }
  return [...keep].sort((a, b) => a - b);
}
