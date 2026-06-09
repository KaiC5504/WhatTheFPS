import type { HeroNumber } from '../types';
import { cx } from './cx';
import './HeroStats.css';

type Tier = 'good' | 'warn' | 'bad' | 'neutral';

// Translate a hero number into a color tier + one-word status. Temps reuse the
// engine's severity (it already grades them); usages/FPS get a UI-side read since
// the engine leaves them neutral. Purely presentational — no new numbers invented.
function classify(tile: HeroNumber): { tier: Tier; status: string } {
  if (tile.value === '—') {
    return { tier: 'neutral', status: tile.key === 'fps' ? 'no framerate logged' : 'no data' };
  }
  const n = parseFloat(tile.value.replace(/[^\d.-]/g, ''));

  switch (tile.key) {
    case 'fps':
      if (Number.isNaN(n)) return { tier: 'neutral', status: 'logged' };
      if (n >= 90) return { tier: 'good', status: 'smooth' };
      if (n >= 50) return { tier: 'neutral', status: 'playable' };
      return { tier: 'warn', status: 'choppy' };

    case 'cpu.usageTotal':
      if (n >= 85) return { tier: 'warn', status: 'maxed' };
      if (n >= 25) return { tier: 'good', status: 'healthy' };
      return { tier: 'neutral', status: 'light' };

    case 'gpu.usage':
      if (n >= 85) return { tier: 'good', status: 'fully used' };
      return { tier: 'warn', status: 'underused' };

    case 'cpu.temp':
    case 'gpu.temp':
      if (tile.severity === 'bad') return { tier: 'bad', status: 'hot' };
      if (tile.severity === 'warn') return { tier: 'warn', status: 'warm' };
      return { tier: 'good', status: 'healthy' };

    default:
      if (tile.severity === 'bad') return { tier: 'bad', status: 'high' };
      if (tile.severity === 'warn') return { tier: 'warn', status: 'elevated' };
      return { tier: 'neutral', status: '' };
  }
}

export function HeroStats({ hero }: { hero: HeroNumber[] }): JSX.Element {
  return (
    <div className="hero-stats">
      {hero.map((tile) => {
        const { tier, status } = classify(tile);
        return (
          <div key={tile.key} className={cx('stat-tile', `stat-tile--${tier}`)}>
            <span className="stat-tile__label u-label">{tile.label}</span>
            <span className="stat-tile__value mono">{tile.value}</span>
            {status ? <span className="stat-tile__status">{status}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
