import { useRef, useState } from 'react';
import { Card } from './primitives';
import { Button } from './primitives';
import { cx } from './cx';

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
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.CSV"
        disabled={disabled}
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <p className="dropzone__prompt">Drop your HWiNFO .CSV here</p>
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
