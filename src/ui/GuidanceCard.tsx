import type { SensorGuidance } from '../types';
import { Card } from './primitives';
import './GuidanceCard.css';

export function GuidanceCard({ guidance }: { guidance: SensorGuidance[] }): JSX.Element | null {
  if (guidance.length === 0) return null;
  return (
    <Card className="guidance">
      <h3 className="guidance__title u-label">Get a sharper verdict next run</h3>
      <ul className="guidance__list">
        {guidance.map((g) => (
          <li key={g.what}>
            <span className="guidance__what">{g.what}</span>
            <span className="guidance__how u-dim">{g.how}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
