import type { ReactNode } from 'react';
import type { Verdict } from '../types';
import { GlassCard } from './primitives';
import { Mascot } from './Mascot';
import { cx } from './cx';
import './HeroVerdict.css';

const PILL_LABEL: Record<Verdict['health'], string> = {
  good: 'All clear',
  warn: 'Worth a look',
  bad: 'Needs attention',
};

// The verdict sentence stays white; exactly one metric (a number + unit) is tinted
// to the run's severity so the eye lands on the figure that drove the call.
const METRIC_RE = /~?\d[\d.,]*\s?(?:°C|%|FPS|fps|GHz|MHz|GB|MB|W|V)/;

function renderHeadline(text: string): ReactNode {
  const m = METRIC_RE.exec(text);
  if (!m || m.index === undefined) return text;
  const end = m.index + m[0].length;
  return (
    <>
      {text.slice(0, m.index)}
      <span className="hero-verdict__metric">{m[0]}</span>
      {text.slice(end)}
    </>
  );
}

export function HeroVerdict({ verdict }: { verdict: Verdict }): JSX.Element {
  const { health, mascotMood, headline } = verdict;

  return (
    <div className={cx('hero', `hero--${health}`)}>
      <div className="hero__ambient" aria-hidden="true">
        <span className="hero__blob hero__blob--cool" />
        <span className="hero__blob hero__blob--signal" />
      </div>
      <GlassCard className={cx('hero-verdict', `hero-verdict--${health}`)}>
        <Mascot mood={mascotMood} size={96} />
        <div className="hero-verdict__body">
          <span className="hero-verdict__pill u-label">{PILL_LABEL[health]}</span>
          <p className="hero-verdict__headline">{renderHeadline(headline)}</p>
          {verdict.coverage && (
            <p className="hero-verdict__coverage u-dim">
              analyzed {(verdict.coverage.gameplayMs / 60_000).toFixed(1)} min of gameplay out of {(verdict.coverage.totalMs / 60_000).toFixed(1)} min logged
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
