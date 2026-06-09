import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, GlassCard, StatTile, Button } from './index';

describe('primitives', () => {
  it('Card renders children on a solid .card surface', () => {
    render(<Card>hello</Card>);
    expect(screen.getByText('hello')).toHaveClass('card');
  });

  it('GlassCard is the frosted surface (the only one)', () => {
    render(<GlassCard>hero</GlassCard>);
    expect(screen.getByText('hero')).toHaveClass('glass-card');
  });

  it('StatTile shows label + mono value and carries its severity class', () => {
    render(<StatTile label="GPU temp" value="88°C" severity="bad" />);
    expect(screen.getByText('GPU temp')).toBeInTheDocument();
    const value = screen.getByText('88°C');
    expect(value).toHaveClass('mono');
    expect(value.closest('.stat-tile')).toHaveClass('stat-tile--bad');
  });

  it('accent Button is a real button with the dark-on-accent variant class', () => {
    render(<Button variant="accent">Copy</Button>);
    const btn = screen.getByRole('button', { name: 'Copy' });
    expect(btn).toHaveClass('btn--accent');
    expect(btn).toHaveAttribute('type', 'button');
  });
});
