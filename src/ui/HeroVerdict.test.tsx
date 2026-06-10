import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroVerdict } from './HeroVerdict';
import type { Verdict } from '../types';

const goodVerdict: Verdict = {
  health: 'good',
  mascotMood: 'chill',
  headline: 'Your run looks healthy',
  hero: [],
  findings: [],
  timeSplit: null,
  worst: [],
  primaryFix: null,
  coverage: null,
  guidance: [],
};

const warnVerdict: Verdict = {
  health: 'warn',
  mascotMood: 'concerned',
  headline: 'Some things worth reviewing',
  hero: [],
  findings: [],
  timeSplit: null,
  worst: [],
  primaryFix: null,
  coverage: null,
  guidance: [],
};

const badVerdict: Verdict = {
  health: 'bad',
  mascotMood: 'panic',
  headline: 'Several issues detected',
  hero: [],
  findings: [],
  timeSplit: null,
  worst: [],
  primaryFix: null,
  coverage: null,
  guidance: [],
};

describe('HeroVerdict', () => {
  it('renders the headline text', () => {
    render(<HeroVerdict verdict={goodVerdict} />);
    expect(screen.getByText('Your run looks healthy')).toBeInTheDocument();
  });

  it('renders a mascot whose root [data-mood] equals verdict.mascotMood', () => {
    const { container } = render(<HeroVerdict verdict={warnVerdict} />);
    expect(container.querySelector('[data-mood]')).toHaveAttribute('data-mood', 'concerned');
  });

  it('bad verdict shows mascot mood panic and "Needs attention" label', () => {
    const { container } = render(<HeroVerdict verdict={badVerdict} />);
    expect(container.querySelector('[data-mood]')).toHaveAttribute('data-mood', 'panic');
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('good verdict shows "All clear" pill', () => {
    render(<HeroVerdict verdict={goodVerdict} />);
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });

  it('warn verdict shows "Worth a look" pill', () => {
    render(<HeroVerdict verdict={warnVerdict} />);
    expect(screen.getByText('Worth a look')).toBeInTheDocument();
  });
});
