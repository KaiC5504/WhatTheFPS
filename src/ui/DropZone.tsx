import { useRef, useState } from 'react';
import { Card } from './primitives';
import { Button } from './primitives';
import { cx } from './cx';
import './DropZone.css';

interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

function isCSV(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv');
}

export function DropZone({ onFile, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    if (!isCSV(file)) {
      setError("That's not a .CSV file");
      return;
    }
    setError(null);
    onFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  return (
    <Card
      className={cx('dropzone', dragOver && 'dropzone--over', disabled && 'dropzone--disabled')}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <span className="dropzone__bracket dropzone__bracket--tl" aria-hidden="true" />
      <span className="dropzone__bracket dropzone__bracket--tr" aria-hidden="true" />
      <span className="dropzone__bracket dropzone__bracket--bl" aria-hidden="true" />
      <span className="dropzone__bracket dropzone__bracket--br" aria-hidden="true" />
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.CSV"
        disabled={disabled}
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <svg
        className="dropzone__glyph"
        viewBox="0 0 48 48"
        width="44"
        height="44"
        fill="none"
        aria-hidden="true"
      >
        <path d="M24 6 V28" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        <path d="M15 21 L24 30 L33 21" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 36 H38" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      </svg>
      <p className="dropzone__prompt">
        Drop your HWiNFO <span className="dropzone__ext">.CSV</span> here
      </p>
      <Button
        variant="ghost"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Browse…
      </Button>
      {error && (
        <p role="alert" className="dropzone__error">
          {error}
        </p>
      )}
    </Card>
  );
}
