import { vi } from 'vitest';
import type uPlot from 'uplot';

// Usage in a test file:
//   vi.mock('uplot', async () => ({ default: (await import('./_uplotMock')).FakeUPlot }));
export const instances: FakeUPlot[] = [];

export function resetUplotMock(): void {
  instances.length = 0;
}

export class FakeUPlot {
  opts: uPlot.Options;
  data: uPlot.AlignedData;
  root = document.createElement('div');
  width: number;
  height: number;
  select = { left: 0, top: 0, width: 0, height: 0 };
  destroy = vi.fn();
  setSize = vi.fn();

  constructor(opts: uPlot.Options, data: uPlot.AlignedData, el: HTMLElement) {
    this.opts = opts;
    this.data = data;
    this.width = opts.width;
    this.height = opts.height;
    this.root.className = 'uplot';
    el.appendChild(this.root);
    instances.push(this);
  }

  // Linear pixel→value map over the x extent — all a setSelect hook needs.
  posToVal(pos: number, _scale: string): number {
    const xs = this.data[0] as number[];
    if (xs.length === 0) return 0;
    const x0 = xs[0];
    const x1 = xs[xs.length - 1];
    if (xs.length === 1 || this.width === 0) return x0;
    return x0 + (pos / this.width) * (x1 - x0);
  }

  fireSelect(left: number, width: number): void {
    this.select = { left, top: 0, width, height: this.height };
    for (const h of this.opts.hooks?.setSelect ?? []) h?.(this as unknown as uPlot);
  }
}
