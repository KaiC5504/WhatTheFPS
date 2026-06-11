import { useState, useMemo } from 'react';
import type { AnalysisResult, Comparison, Digest, DigestMode, InferredSpecs, SavedRun } from '../types';
import { buildDigest } from '../digest/digest';
import { buildCompareDigest } from '../digest/compareDigest';
import { Card, Button } from './primitives';
import './DigestPanel.css';

const DEFAULT_GOAL = 'help me lower temps without losing FPS';
const COMPARE_GOAL = 'did this change help, and what else can I tune?';

export type DigestSource =
  | { kind: 'live'; result: AnalysisResult; specs: InferredSpecs }
  | { kind: 'saved'; run: SavedRun }
  | { kind: 'compare'; before: SavedRun; after: SavedRun; comparison: Comparison };

export function DigestPanel({ source }: { source: DigestSource }): JSX.Element {
  const [mode, setMode] = useState<DigestMode>('compact');
  const [goal, setGoal] = useState(source.kind === 'compare' ? COMPARE_GOAL : DEFAULT_GOAL);

  const digest = useMemo<Digest>(() => {
    switch (source.kind) {
      case 'live':
        return buildDigest({
          log: { ...source.result.log, specs: source.specs },
          stats: source.result.stats,
          events: source.result.events,
          windows: source.result.windows,
          guidance: source.result.verdict.guidance,
          goal,
        });
      case 'saved':
        return source.run.result.digest;
      case 'compare':
        return buildCompareDigest(source.before, source.after, source.comparison, { goal });
    }
  }, [source, goal]);

  function handleCopy() {
    navigator.clipboard.writeText(digest[mode]);
  }

  return (
    <div className="digest-panel">
      <div className="digest-panel__header">
        <h2 className="digest-panel__title">Copy prompt for my LLM</h2>
        <div className="digest-panel__toggle" role="group" aria-label="Digest mode">
          <Button
            variant={mode === 'compact' ? 'accent' : 'subtle'}
            onClick={() => setMode('compact')}
          >
            Compact
          </Button>
          <Button
            variant={mode === 'full' ? 'accent' : 'subtle'}
            onClick={() => setMode('full')}
          >
            Full
          </Button>
        </div>
      </div>

      {source.kind === 'saved' ? (
        <p className="u-dim">
          Saved runs keep the prompt they were analyzed with — the goal can't be edited here.
        </p>
      ) : (
        <>
          <label className="digest-panel__goal-label u-label" htmlFor="digest-goal">
            Your goal
          </label>
          <textarea
            id="digest-goal"
            className="digest-panel__goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
          />
        </>
      )}

      <Card tone="inset" className="digest-panel__well">
        <pre className="mono digest-panel__pre">{digest[mode]}</pre>
      </Card>

      <div className="digest-panel__footer">
        <span className="digest-panel__tokens u-dim">
          ~{digest.tokenEstimate[mode]} tokens
        </span>
        <Button variant="accent" onClick={handleCopy}>
          Copy prompt
        </Button>
      </div>
    </div>
  );
}
