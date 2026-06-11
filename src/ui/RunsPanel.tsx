import { useState } from 'react';
import type { SavedRun } from '../types';
import { GlassCard, Button } from './primitives';
import { fmtTimestamp } from './compareFormat';
import './RunsPanel.css';

interface RunsPanelProps {
  runs: SavedRun[];
  onClose: () => void;
  onOpenRun: (run: SavedRun) => void;
  onCompare: (before: SavedRun, after: SavedRun) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function RunsPanel(props: RunsPanelProps): JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const sorted = [...props.runs].sort((a, b) => b.createdAt - a.createdAt);

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : cur,
    );
  }

  function compare() {
    const picked = props.runs.filter((r) => selected.includes(r.id));
    if (picked.length !== 2) return;
    // chronology decides the roles; CompareView has a Swap control for the rest
    const [before, after] = [...picked].sort((a, b) => a.createdAt - b.createdAt);
    props.onCompare(before, after);
  }

  function commitRename(id: string) {
    const name = draft.trim();
    if (name) props.onRename(id, name);
    setEditingId(null);
  }

  return (
    <div className="runs-overlay" role="dialog" aria-modal="true" aria-label="Saved runs">
      <div className="runs-overlay__backdrop" onClick={props.onClose} />
      <GlassCard className="runs-panel">
        <div className="runs-panel__header">
          <h2 className="runs-panel__title">Saved runs</h2>
          <Button variant="ghost" onClick={props.onClose}>Close</Button>
        </div>

        {sorted.length === 0 ? (
          <p className="u-dim">No saved runs yet — every analyzed log lands here automatically.</p>
        ) : (
          <ul className="runs-panel__list">
            {sorted.map((run) => (
              <li key={run.id} className="runs-panel__row">
                <input
                  type="checkbox"
                  className="runs-panel__check"
                  aria-label={`Select ${run.name} for compare`}
                  checked={selected.includes(run.id)}
                  disabled={!selected.includes(run.id) && selected.length >= 2}
                  onChange={() => toggle(run.id)}
                />
                {editingId === run.id ? (
                  <input
                    className="runs-panel__rename mono"
                    aria-label="Run name"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(run.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(run.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="runs-panel__open" onClick={() => props.onOpenRun(run)}>
                    <span className="runs-panel__name">{run.name}</span>
                    <span className="runs-panel__meta mono u-dim">{fmtTimestamp(run.createdAt)}</span>
                  </button>
                )}
                <Button
                  variant="subtle"
                  disabled={editingId === run.id}
                  onClick={() => { setEditingId(run.id); setDraft(run.name); }}
                >Rename</Button>
                <Button variant="subtle" onClick={() => props.onDelete(run.id)}>Delete</Button>
              </li>
            ))}
          </ul>
        )}

        <div className="runs-panel__footer">
          <Button variant="ghost" onClick={props.onClearAll} disabled={sorted.length === 0}>Clear all</Button>
          <Button variant="accent" onClick={compare} disabled={selected.length !== 2}>Compare</Button>
        </div>
      </GlassCard>
    </div>
  );
}
