import { useEffect } from 'react';
import type { RefObject } from 'react';
import uPlot from 'uplot';

export interface ChartSpec { opts: uPlot.Options; data: uPlot.AlignedData }

// Owns the uPlot lifecycle. A `build` identity change (new log, new sensor
// chip) recreates the chart outright — construction is ~1 ms, far cheaper than
// diffing live options. Container width changes go through setSize.
export function useUPlot(
  ref: RefObject<HTMLDivElement>,
  build: (el: HTMLElement, width: number) => ChartSpec,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { opts, data } = build(el, el.clientWidth || 600);
    const chart = new uPlot(opts, data, el);

    // jsdom has no ResizeObserver; in tests the chart keeps its mount width.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w > 0 && w !== chart.width) chart.setSize({ width: w, height: opts.height });
      });
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      chart.destroy();
    };
  }, [ref, build]);
}
