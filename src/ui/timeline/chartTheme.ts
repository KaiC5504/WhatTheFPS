export interface ChartTheme {
  accent: string;
  text: string;
  textDim: string;
  warn: string;
  bad: string;
  good: string;
  inset: string;
  border: string;
  fontMono: string;
}

// DESIGN.md forbids restating colors outside theme.css, but uPlot paints into
// a canvas where CSS variables don't resolve. So we READ the tokens off the
// mounted element at runtime — theme.css stays the single source of truth and
// this file never hardcodes a hex. Empty reads (jsdom, or a missing token)
// fall back to the --text value so the chart degrades to monochrome rather
// than invisible.
export function readChartTheme(el: HTMLElement): ChartTheme {
  const style = getComputedStyle(el);
  const raw = (token: string) => style.getPropertyValue(token).trim();
  const text = raw('--text') || 'currentColor';
  const color = (token: string) => raw(token) || text;
  return {
    accent: color('--accent'),
    text,
    textDim: color('--text-dim'),
    warn: color('--warn'),
    bad: color('--bad'),
    good: color('--good'),
    inset: color('--inset'),
    border: color('--border'),
    fontMono: raw('--font-mono') || 'monospace',
  };
}
