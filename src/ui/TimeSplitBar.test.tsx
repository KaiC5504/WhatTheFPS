import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TimeSplitBar } from './TimeSplitBar';
import { fixtureWindows } from './_fixtures';

describe('TimeSplitBar', () => {
  it('renders one segment + legend entry per nonzero limiter share with percents', () => {
    const wa = fixtureWindows();
    render(<TimeSplitBar split={wa.timeSplit} activityKind="gameplay" />);
    expect(screen.getByText('GPU-bound')).toBeInTheDocument();
    expect(screen.getByText('CPU-bound')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(/GPU-bound 75%/);
  });
  it('renders nothing without gameplay', () => {
    const { container } = render(
      <TimeSplitBar split={{ gameplayMs: 0, totalMs: 100, shares: {}, dominant: null }} activityKind="gameplay" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
