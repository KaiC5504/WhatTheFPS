import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './controls.css';

const ChevronUp = (
  <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
    <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronDown = (
  <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface NumberFieldProps {
  value: number | '' | null;
  onValueChange: (next: number | null) => void;
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

// A native number input — keeping keyboard ↑/↓ and the spinbutton role — with the
// system spinner hidden and a themed stepper drawn in its place.
export function NumberField({ value, onValueChange, ariaLabel, min, max, step = 1, placeholder }: NumberFieldProps) {
  const current = value === '' || value == null ? null : value;

  function clamp(n: number): number {
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  }
  function bump(dir: 1 | -1) {
    onValueChange(clamp((current ?? min ?? 0) + dir * step));
  }

  return (
    <div className="ctl-num">
      <input
        type="number"
        className="ctl-num__input mono"
        aria-label={ariaLabel}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onValueChange(null);
          const n = parseFloat(raw);
          onValueChange(Number.isNaN(n) ? null : n);
        }}
      />
      <span className="ctl-num__spin">
        <button type="button" tabIndex={-1} aria-hidden="true" className="ctl-num__btn" onClick={() => bump(1)}>
          {ChevronUp}
        </button>
        <button type="button" tabIndex={-1} aria-hidden="true" className="ctl-num__btn" onClick={() => bump(-1)}>
          {ChevronDown}
        </button>
      </span>
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx('ctl-check', className)}>
      <input type="checkbox" className="ctl-check__input" {...rest} />
      <span className="ctl-check__box" aria-hidden="true">
        <svg viewBox="0 0 12 10" width="12" height="10">
          <path d="M1 5l3.2 3.4L11 1.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label != null && <span className="ctl-check__label">{label}</span>}
    </label>
  );
}
