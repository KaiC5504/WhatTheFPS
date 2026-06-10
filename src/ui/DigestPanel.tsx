import { useState, useMemo } from 'react';
import type { AnalysisResult, DigestMode, InferredSpecs } from '../types';
import { buildDigest } from '../digest/digest';
import { Card, Button } from './primitives';
import './DigestPanel.css';

const DEFAULT_GOAL = 'help me lower temps without losing FPS';

export function DigestPanel({
  result,
  specs,
}: {
  result: AnalysisResult;
  specs: InferredSpecs;
}): JSX.Element {
  const [mode, setMode] = useState<DigestMode>('compact');
  const [goal, setGoal] = useState(DEFAULT_GOAL);

  // Recompute whenever the result, goal, or specs change. We inject the caller's
  // (possibly user-edited) specs into the log so they flow into the prompt.
  const digest = useMemo(
    () =>
      buildDigest({
        log: { ...result.log, specs },
        stats: result.stats,
        events: result.events,
        windows: result.windows,
        guidance: result.verdict.guidance,
        goal,
      }),
    [result.log, result.stats, result.events, result.windows, result.verdict.guidance, specs, goal],
  );

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
