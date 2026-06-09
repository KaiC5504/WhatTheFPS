import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroStats } from './HeroStats';
import type { HeroNumber } from '../types';

const fiveHero: HeroNumber[] = [
  { key: 'cpu_temp', label: 'CPU Temp', value: '72°C', severity: 'warn' },
  { key: 'gpu_temp', label: 'GPU Temp', value: '81°C', severity: 'bad' },
  { key: 'cpu_usage', label: 'CPU Usage', value: '55%', severity: 'info' },
  { key: 'gpu_usage', label: 'GPU Usage', value: '99%', severity: 'warn' },
  { key: 'fps', label: 'FPS', value: '120', severity: 'info' },
];

describe('HeroStats', () => {
  it('renders exactly 5 .stat-tile elements for a 5-entry hero array', () => {
    const { container } = render(<HeroStats hero={fiveHero} />);
    expect(container.querySelectorAll('.stat-tile')).toHaveLength(5);
  });

  it('a tile with severity bad carries .stat-tile--bad', () => {
    const { container } = render(<HeroStats hero={fiveHero} />);
    expect(container.querySelector('.stat-tile--bad')).not.toBeNull();
  });

  it('fps tile with value "—" shows "no framerate logged" sublabel', () => {
    const hero: HeroNumber[] = [
      ...fiveHero.slice(0, 4),
      { key: 'fps', label: 'FPS', value: '—', severity: 'info' },
    ];
    render(<HeroStats hero={hero} />);
    expect(screen.getByText('no framerate logged')).toBeInTheDocument();
  });

  it('fps tile with a real value does NOT show the sublabel', () => {
    render(<HeroStats hero={fiveHero} />);
    expect(screen.queryByText('no framerate logged')).toBeNull();
  });
});
