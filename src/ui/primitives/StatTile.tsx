import type { Severity } from '../../types';
import { cx } from '../cx';

interface StatTileProps {
  label: string;
  value: string;
  severity: Severity;
  sublabel?: string;
}

// An instrument readout: big mono value, micro uppercase label, severity-tinted.
export function StatTile({ label, value, severity, sublabel }: StatTileProps) {
  return (
    <div className={cx('stat-tile', `stat-tile--${severity}`)}>
      <span className="stat-tile__label u-label">{label}</span>
      <span className="stat-tile__value mono">{value}</span>
      {sublabel ? <span className="stat-tile__sub">{sublabel}</span> : null}
    </div>
  );
}
