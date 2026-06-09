import { Button } from './primitives';
import { cx } from './cx';
import './TopBar.css';

interface TopBarProps {
  mode: 'easy' | 'nerd';
  onModeChange: (m: 'easy' | 'nerd') => void;
  onOpenSettings?: () => void;
}

export function TopBar({ mode, onModeChange, onOpenSettings }: TopBarProps) {
  return (
    <header className="topbar">
      <span className="wordmark">
        WT<span className="wordmark__f">F</span>PS
      </span>
      <p className="topbar__tagline u-dim">HWiNFO log analyzer</p>
      {onOpenSettings && (
        <Button
          variant="ghost"
          className="topbar__settings"
          aria-label="Edit system specs"
          onClick={onOpenSettings}
        >
          ⚙ Specs
        </Button>
      )}
      <nav className="topbar__toggle" role="tablist" aria-label="View mode">
        <Button
          role="tab"
          aria-pressed={mode === 'easy'}
          aria-selected={mode === 'easy'}
          variant={mode === 'easy' ? 'accent' : 'ghost'}
          className={cx(mode === 'easy' && 'is-active')}
          onClick={() => { if (mode !== 'easy') onModeChange('easy'); }}
        >
          Easy
        </Button>
        <Button
          role="tab"
          aria-pressed={mode === 'nerd'}
          aria-selected={mode === 'nerd'}
          variant={mode === 'nerd' ? 'accent' : 'ghost'}
          className={cx(mode === 'nerd' && 'is-active')}
          onClick={() => { if (mode !== 'nerd') onModeChange('nerd'); }}
        >
          Nerd
        </Button>
      </nav>
    </header>
  );
}
