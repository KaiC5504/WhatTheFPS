import type { Evidence } from '../types';
import { cx } from './cx';
import './EvidenceBadge.css';

export function EvidenceBadge({ evidence }: { evidence?: Evidence }): JSX.Element | null {
  if (!evidence) return null;
  return (
    <span
      className={cx('evidence-badge', 'u-label', `evidence-badge--${evidence.tier}`)}
      title={evidence.basis.join(' · ')}
    >
      {evidence.tier}
    </span>
  );
}
