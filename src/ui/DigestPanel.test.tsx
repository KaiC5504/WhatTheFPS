import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DigestPanel } from './DigestPanel';
import { analyze } from '../engine/analyze';
import { makeSlim, makeSavedRun, stat } from '../compare/testkit';
import { compareRuns } from '../compare/diff';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');

const result = analyze(new TextEncoder().encode(tinyCsv));
const specs = result.log.specs;

describe('DigestPanel', () => {
  it('clicking "Copy prompt" calls writeText with a string containing the compact header', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<DigestPanel source={{ kind: 'live', result, specs }} />);
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('HWiNFO session summary (compact)');
  });

  it('clicking Full toggle changes the token estimate and the digest text contains "(full)"', () => {
    render(<DigestPanel source={{ kind: 'live', result, specs }} />);

    const compactTokenText = screen.getByText(/~\d+ tokens/);
    const compactTokenContent = compactTokenText.textContent;

    fireEvent.click(screen.getByRole('button', { name: /full/i }));

    const fullTokenText = screen.getByText(/~\d+ tokens/);
    expect(fullTokenText.textContent).not.toBe(compactTokenContent);

    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('(full)');
  });

  it('typing into the goal textarea updates the digest text to include the new goal', () => {
    render(<DigestPanel source={{ kind: 'live', result, specs }} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'maximize FPS above all else' } });

    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('maximize FPS above all else');
  });
});

describe('DigestPanel — saved and compare sources', () => {
  it('saved mode shows the stored digest verbatim and disables goal editing', () => {
    const run = makeSavedRun(makeSlim({
      digest: { compact: 'STORED COMPACT\n\nGoal: old goal', full: 'STORED FULL\n\nGoal: old goal' },
    }));
    render(<DigestPanel source={{ kind: 'saved', run }} />);
    expect(document.querySelector('pre')?.textContent).toContain('STORED COMPACT');
    expect(document.querySelector('pre')?.textContent).toContain('Goal: old goal');   // verbatim, goal included
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/goal.*can't be edited/i)).toBeInTheDocument();
  });

  it('compare mode builds the compare digest and the goal stays editable', () => {
    const before = makeSlim({ fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 100 }) } });
    const after = makeSlim({ fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 112 }) } });
    const comparison = compareRuns(before, after);
    const runB = makeSavedRun(before, { id: 'b', name: 'stock', createdAt: 1 });
    const runA = makeSavedRun(after, { id: 'a', name: 'tuned', createdAt: 2 });
    render(<DigestPanel source={{ kind: 'compare', before: runB, after: runA, comparison }} />);
    expect(document.querySelector('pre')?.textContent).toContain('HWiNFO before/after comparison');
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('did this change help, and what else can I tune?');
    fireEvent.change(textarea, { target: { value: 'is the undervolt stable?' } });
    expect(document.querySelector('pre')?.textContent).toContain('is the undervolt stable?');
  });
});
