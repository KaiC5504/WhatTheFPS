import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { WorstMoment } from '../types';
import { WorstMoments } from './WorstMoments';
import { fixtureWindows } from './_fixtures';

describe('WorstMoments', () => {
  it('renders drop %, limiter, snapshot values and badge', () => {
    const wm: WorstMoment = {
      classification: {
        window: { index: 2, startRow: 8, endRow: 11, startMs: 16000, endMs: 22000 },
        activity: 'gameplay', limiter: 'cpu', tier: 'measured', basis: ['GPU sat idle'],
        metrics: fixtureWindows().windows[2].metrics,
      },
      fpsDropPct: 54,
      snapshot: [{ label: 'FPS', value: '45', unit: null }, { label: 'Frame time', value: '22.0', unit: 'ms' }],
    };
    render(<WorstMoments worst={[wm]} />);
    expect(screen.getByText(/−54%/)).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('measured')).toBeInTheDocument();
  });
  it('renders nothing for an empty list', () => {
    const { container } = render(<WorstMoments worst={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
