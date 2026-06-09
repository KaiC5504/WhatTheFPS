import { Card } from './primitives';
import { NumberField, Checkbox } from './controls';
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

  return (
    <Card>
      <h3>System (inferred — edit if wrong)</h3>
      <div className="specs-card__fields">
        <label className="specs-card__field specs-card__field--wide">
          <span className="u-label">System</span>
          <input
            type="text"
            aria-label="System model"
            value={specs.systemModel ?? ''}
            onChange={(e) => update({ systemModel: e.target.value || null })}
          />
        </label>
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
        {specs.igpuPresent && (
          <label className="specs-card__field">
            <span className="u-label">iGPU</span>
            <input
              type="text"
              aria-label="Integrated GPU model"
              value={specs.igpuModelGuess ?? ''}
              onChange={(e) => update({ igpuModelGuess: e.target.value || null })}
            />
          </label>
        )}
        <label className="specs-card__field">
          <span className="u-label">RAM (GB)</span>
          <NumberField
            ariaLabel="RAM in GB"
            value={ramGb}
            min={0}
            onValueChange={(n) => update({ ramMb: n == null ? null : Math.round(n) * 1024 })}
          />
        </label>
        <label className="specs-card__field">
          <span className="u-label">RAM kit</span>
          <input
            type="text"
            aria-label="RAM kit"
            value={specs.ramModelGuess ?? ''}
            onChange={(e) => update({ ramModelGuess: e.target.value || null })}
          />
        </label>
        <label className="specs-card__field">
          <span className="u-label">RAM sticks</span>
          <NumberField
            ariaLabel="RAM modules"
            value={specs.ramModules ?? ''}
            min={0}
            onValueChange={(n) => update({ ramModules: n == null ? null : Math.round(n) })}
          />
        </label>
        <div className="specs-card__field specs-card__field--laptop">
          <Checkbox
            label="Laptop"
            checked={specs.isLaptop}
            onChange={(e) => update({ isLaptop: e.target.checked })}
          />
        </div>
      </div>
    </Card>
  );
}
