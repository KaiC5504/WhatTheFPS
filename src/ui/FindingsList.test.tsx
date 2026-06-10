import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FindingsList } from './FindingsList';
import type { Finding } from '../types';

describe('FindingsList', () => {
  it('renders text and "Try: …" line for a finding with a fix', () => {
    const findings: Finding[] = [
      { severity: 'bad', text: 'GPU is thermal throttling', fix: 'clean the heatsink' },
    ];
    const { container } = render(<FindingsList findings={findings} />);
    expect(screen.getByText('GPU is thermal throttling')).toBeInTheDocument();
    expect(screen.getByText('Try: clean the heatsink')).toBeInTheDocument();
    expect(container.querySelector('.finding--bad')).not.toBeNull();
  });

  it('does not render a Try line when fix is absent', () => {
    const findings: Finding[] = [
      { severity: 'info', text: 'CPU usage is moderate' },
    ];
    render(<FindingsList findings={findings} />);
    expect(screen.queryByText(/^Try:/)).toBeNull();
  });

  it('empty findings array renders the healthy fallback line', () => {
    render(<FindingsList findings={[]} />);
    expect(
      screen.getByText('Nothing notable flagged — this run looks healthy.'),
    ).toBeInTheDocument();
  });

  it('non-empty findings do not show the healthy fallback', () => {
    const findings: Finding[] = [{ severity: 'warn', text: 'Something minor' }];
    render(<FindingsList findings={findings} />);
    expect(
      screen.queryByText('Nothing notable flagged — this run looks healthy.'),
    ).toBeNull();
  });

  it('shows an evidence badge when requested', () => {
    render(<FindingsList findings={[{ severity: 'warn', text: 'x', evidence: { tier: 'measured', basis: ['b'] } }]} showEvidence />);
    expect(screen.getByText('measured')).toBeInTheDocument();
  });

  it('hides badges by default (easy mode)', () => {
    render(<FindingsList findings={[{ severity: 'warn', text: 'x', evidence: { tier: 'measured', basis: ['b'] } }]} />);
    expect(screen.queryByText('measured')).toBeNull();
  });
});
