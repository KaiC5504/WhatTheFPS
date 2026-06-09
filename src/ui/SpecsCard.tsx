import { Card } from './primitives';
import { saveSpecs } from '../storage/specsStore';
import type { InferredSpecs } from '../types';
import './SpecsCard.css';

interface SpecsCardProps {
  specs: InferredSpecs;
  onChange: (next: InferredSpecs) => void;
}

export function SpecsCard({ specs, onChange }: SpecsCardProps) {
  function update(patch: Partial<InferredSpecs>) {
    const next: InferredSpecs = { ...specs, ...patch };
    onChange(next);
    saveSpecs(next);
  }

  const ramGb = specs.ramMb != null ? Math.round(specs.ramMb / 1024) : '';

  function handleRamChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === '') {
      update({ ramMb: null });
    } else {
      const gb = parseInt(raw, 10);
      if (!isNaN(gb)) update({ ramMb: gb * 1024 });
    }
  }

  return (
    <Card>
      <h3>System (inferred — edit if wrong)</h3>
      <div className="specs-card__fields">
        <label className="specs-card__field">
          <span className="u-label">CPU</span>
          <input
            type="text"
            aria-label="CPU model"
            value={specs.cpuModelGuess ?? ''}
            onChange={(e) => update({ cpuModelGuess: e.target.value })}
          />
        </label>
        <label className="specs-card__field">
          <span className="u-label">GPU</span>
          <input
            type="text"
            aria-label="GPU model"
            value={specs.gpuModelGuess ?? ''}
            onChange={(e) => update({ gpuModelGuess: e.target.value })}
          />
        </label>
        <label className="specs-card__field">
          <span className="u-label">RAM (GB)</span>
          <input
            type="number"
            aria-label="RAM in GB"
            value={ramGb}
            onChange={handleRamChange}
          />
        </label>
        <label className="specs-card__field specs-card__field--laptop">
          <input
            type="checkbox"
            aria-label="Laptop"
            checked={specs.isLaptop}
            onChange={(e) => update({ isLaptop: e.target.checked })}
          />
          <span>Laptop</span>
        </label>
      </div>
    </Card>
  );
}
