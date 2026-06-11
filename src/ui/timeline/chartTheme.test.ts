import { describe, it, expect, vi, afterEach } from 'vitest';
import { readChartTheme } from './chartTheme';

function stubTokens(map: Record<string, string>) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => map[name] ?? '',
  } as unknown as CSSStyleDeclaration);
}

afterEach(() => vi.restoreAllMocks());

describe('readChartTheme', () => {
  it('reads every chart token off the element', () => {
    stubTokens({
      '--accent': '#3b9eff', '--text': '#e8eef6', '--text-dim': '#9aa7b8',
      '--warn': '#f5b941', '--bad': '#ff5d5d', '--good': '#4ade80',
      '--inset': '#0b0f15', '--border': '#222a35', '--font-mono': "'JetBrains Mono', monospace",
    });
    const t = readChartTheme(document.body);
    expect(t.accent).toBe('#3b9eff');
    expect(t.text).toBe('#e8eef6');
    expect(t.textDim).toBe('#9aa7b8');
    expect(t.warn).toBe('#f5b941');
    expect(t.bad).toBe('#ff5d5d');
    expect(t.good).toBe('#4ade80');
    expect(t.inset).toBe('#0b0f15');
    expect(t.border).toBe('#222a35');
    expect(t.fontMono).toBe("'JetBrains Mono', monospace");
  });

  it('falls back to the --text value when a color token is empty', () => {
    stubTokens({ '--text': '#e8eef6' });
    const t = readChartTheme(document.body);
    expect(t.accent).toBe('#e8eef6');
    expect(t.inset).toBe('#e8eef6');
  });

  it('survives a fully empty style (jsdom default) without empty strings', () => {
    stubTokens({});
    const t = readChartTheme(document.body);
    expect(t.text).toBe('currentColor');
    expect(t.warn).toBe('currentColor');
    expect(t.fontMono).toBe('monospace');
  });
});
