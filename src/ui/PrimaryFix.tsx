import type { Finding } from '../types';
import { Card } from './primitives';
import { cx } from './cx';
import './PrimaryFix.css';

export function PrimaryFix({ fix }: { fix: Finding | null }): JSX.Element {
  if (!fix) {
    return (
      <Card className="primary-fix primary-fix--healthy">
        <p className="primary-fix__text">Nothing to fix — this run looks healthy. Game on.</p>
      </Card>
    );
  }
  return (
    <Card className={cx('primary-fix', `primary-fix--${fix.severity}`)}>
      <h3 className="primary-fix__title u-label">The one thing to try</h3>
      <p className="primary-fix__text">{fix.text}</p>
      {fix.fix ? <p className="primary-fix__action">{fix.fix}</p> : null}
    </Card>
  );
}
