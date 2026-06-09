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

export function HeroVerdict({ verdict }: { verdict: Verdict }): JSX.Element {
  const { health, mascotMood, headline } = verdict;

  return (
    <GlassCard className={cx('hero-verdict', `hero-verdict--${health}`)}>
      <div className="hero-verdict__pill u-label">{PILL_LABEL[health]}</div>
      <Mascot mood={mascotMood} />
      <p className="hero-verdict__headline">{headline}</p>
    </GlassCard>
  );
}
