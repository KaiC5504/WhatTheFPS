import type { HeroNumber } from '../types';
import { StatTile } from './primitives';
import './HeroStats.css';

export function HeroStats({ hero }: { hero: HeroNumber[] }): JSX.Element {
  return (
    <div className="hero-stats">
      {hero.map((tile) => (
        <StatTile
          key={tile.key}
          label={tile.label}
          value={tile.value}
          severity={tile.severity}
          sublabel={tile.key === 'fps' && tile.value === '—' ? 'no framerate logged' : undefined}
        />
      ))}
    </div>
  );
}
