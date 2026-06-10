import type { Finding } from '../types';
import { cx } from './cx';
import { EvidenceBadge } from './EvidenceBadge';
import './FindingsList.css';

export function FindingsList({ findings, showEvidence = false }: { findings: Finding[]; showEvidence?: boolean }): JSX.Element {
  if (findings.length === 0) {
    return (
      <ul className="findings-list">
        <li className="finding finding--healthy">
          <span className="finding__dot" />
          <span className="finding__text">Nothing notable flagged — this run looks healthy.</span>
        </li>
      </ul>
    );
  }

  return (
    <ul className="findings-list">
      {findings.map((f, i) => (
        <li key={i} className={cx('finding', `finding--${f.severity}`)}>
          <span className="finding__dot" />
          <span className="finding__body">
            <span className="finding__text">{f.text}</span>
            {showEvidence ? <EvidenceBadge evidence={f.evidence} /> : null}
            {f.fix ? <span className="finding__fix">Try: {f.fix}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
