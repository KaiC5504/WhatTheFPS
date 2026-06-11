import type { SavedRun } from '../types';
import { HeroVerdict } from './HeroVerdict';
import { HeroStats } from './HeroStats';
import { FindingsList } from './FindingsList';
import { TimeSplitBar } from './TimeSplitBar';
import { PrimaryFix } from './PrimaryFix';
import { WorstMoments } from './WorstMoments';
import { DigestPanel } from './DigestPanel';
import { Card, Button } from './primitives';
import { fmtTimestamp } from './compareFormat';
import './SavedRunView.css';

// Read-only view of a stored run. Everything here comes from SlimResult — the raw
// arrays are gone, so the live-only nerd extras (timeline, core grid, sensor table)
// are deliberately absent and the notice says why.
export function SavedRunView({ run, mode, onBack }: {
  run: SavedRun;
  mode: 'easy' | 'nerd';
  onBack: () => void;
}): JSX.Element {
  const { verdict, windows } = run.result;
  return (
    <div className="results stack">
      <Card className="saved-run-bar">
        <div>
          <p className="u-label">Saved run</p>
          <p className="saved-run-bar__name">
            {run.name} <span className="mono u-dim">{fmtTimestamp(run.createdAt)}</span>
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </Card>

      <HeroVerdict verdict={verdict} />
      <HeroStats hero={verdict.hero} />

      {verdict.timeSplit && (
        <TimeSplitBar split={verdict.timeSplit} activityKind={windows.activityKind} />
      )}

      {mode === 'easy' ? (
        <PrimaryFix fix={verdict.primaryFix} />
      ) : (
        <>
          <FindingsList findings={verdict.findings} showEvidence />
          <WorstMoments worst={windows.worst} baseMs={windows.logStartMs} />
        </>
      )}

      <DigestPanel source={{ kind: 'saved', run }} />

      <Card className="saved-run-notice">
        <p className="u-dim">
          Saved runs keep summary data only — re-drop the original CSV for the timeline,
          per-core grid, per-flag samples and the full sensor table.
        </p>
      </Card>
    </div>
  );
}
