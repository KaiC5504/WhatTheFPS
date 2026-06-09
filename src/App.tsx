import { useEffect, useState } from 'react';
import type { AnalysisResult, InferredSpecs } from './types';
import { TopBar } from './ui/TopBar';
import { DropZone } from './ui/DropZone';
import { HeroVerdict } from './ui/HeroVerdict';
import { HeroStats } from './ui/HeroStats';
import { FindingsList } from './ui/FindingsList';
import { DigestPanel } from './ui/DigestPanel';
import { SpecsCard } from './ui/SpecsCard';
import { NerdView } from './ui/NerdView';
import { Mascot } from './ui/Mascot';
import { useAnalysis, type AnalysisStatus } from './ui/useAnalysis';
import { loadSpecs } from './storage/specsStore';
import { Button } from './ui/primitives';
import './ui/App.css';

type UiMode = 'easy' | 'nerd';

export function App() {
  const { status, result, error, analyzeFile, reset } = useAnalysis();
  const [mode, setMode] = useState<UiMode>('easy');
  const [specs, setSpecs] = useState<InferredSpecs | null>(null);

  // On a fresh result, seed the editable specs from a saved override if present,
  // otherwise from what the engine inferred.
  useEffect(() => {
    if (result) setSpecs(loadSpecs() ?? result.log.specs);
  }, [result]);

  return (
    <div className="app">
      <TopBar mode={mode} onModeChange={setMode} />
      <main className="app__main">
        {status === 'ready' && result ? (
          <Results
            result={result}
            specs={specs ?? result.log.specs}
            mode={mode}
            onSpecsChange={setSpecs}
            onReset={reset}
          />
        ) : (
          <Landing status={status} error={error} onFile={analyzeFile} />
        )}
      </main>
      <footer className="app__footer u-dim">
        Runs entirely in your browser — your log never leaves your machine.
      </footer>
    </div>
  );
}

function Landing({
  status,
  error,
  onFile,
}: {
  status: AnalysisStatus;
  error: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <section className="landing">
      <div className="landing__mascot">
        <Mascot mood="chill" size={104} />
      </div>
      <p className="landing__kicker u-label">HWiNFO sensor-log analyzer</p>
      <h1 className="landing__title">
        What the <span className="landing__f">F</span>PS is going on?
      </h1>
      <p className="landing__pitch">
        Drop a HWiNFO sensor log and get a plain-language verdict on what's holding your frame
        rate back — plus a copy-paste prompt for your favorite LLM.
      </p>
      <DropZone onFile={onFile} disabled={status === 'parsing'} />
      {status === 'parsing' && <p className="landing__status u-dim">Analyzing your log…</p>}
      {status === 'error' && (
        <p role="alert" className="landing__error">
          Couldn't read that log{error ? `: ${error}` : ''}. Try a different HWiNFO CSV.
        </p>
      )}
    </section>
  );
}

function Results({
  result,
  specs,
  mode,
  onSpecsChange,
  onReset,
}: {
  result: AnalysisResult;
  specs: InferredSpecs;
  mode: UiMode;
  onSpecsChange: (next: InferredSpecs) => void;
  onReset: () => void;
}) {
  return (
    <div className="results stack">
      <section className="results__hero">
        <HeroVerdict verdict={result.verdict} />
        <HeroStats hero={result.verdict.hero} />
      </section>

      <FindingsList findings={result.verdict.findings} />

      <div className="results__cols">
        <DigestPanel result={result} specs={specs} />
        <SpecsCard specs={specs} onChange={onSpecsChange} />
      </div>

      {mode === 'nerd' && <NerdView result={result} />}

      <div className="results__actions">
        <Button variant="ghost" onClick={onReset}>
          Analyze another log
        </Button>
        <Button variant="subtle" disabled title="Before/after comparison is coming in v2">
          Compare runs (soon)
        </Button>
      </div>
    </div>
  );
}
