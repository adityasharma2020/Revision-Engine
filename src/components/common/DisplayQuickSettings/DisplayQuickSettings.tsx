import { useEffect, useState } from 'react';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { cx } from '../../../utils/cx';
import { Icon } from '../Icon';
import styles from './DisplayQuickSettings.module.css';

const FONT_SCALES = [90, 100, 110, 120, 130] as const;

interface DisplayQuickSettingsProps {
  className?: string;
  fullscreenOnly?: boolean;
  labelled?: boolean;
  onFullscreenToggle?: () => void;
}

/** App-wide fullscreen and typography controls, designed for touch use. */
export function DisplayQuickSettings({ className, fullscreenOnly = false, labelled = false, onFullscreenToggle }: DisplayQuickSettingsProps) {
  const { settings, update } = useAppSettings();
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullscreenError, setFullscreenError] = useState(false);
  const fontScale = settings.accessibility.fontScale;

  useEffect(() => {
    const sync = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) delete document.documentElement.dataset.appFullscreen;
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        onFullscreenToggle?.();
        return;
      }
      document.documentElement.dataset.appFullscreen = 'true';
      await document.documentElement.requestFullscreen();
      onFullscreenToggle?.();
    } catch {
      delete document.documentElement.dataset.appFullscreen;
      setFullscreenError(true);
    }
  };

  const changeScale = (direction: -1 | 1) => {
    const nearest = FONT_SCALES.reduce((best, value) =>
      Math.abs(value - fontScale) < Math.abs(best - fontScale) ? value : best);
    const index = FONT_SCALES.indexOf(nearest);
    const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, index + direction))];
    update((current) => ({
      ...current,
      accessibility: { ...current.accessibility, fontScale: next },
    }));
  };

  const fullscreenSupported = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);

  return (
    <div className={cx(styles.wrapper, labelled && styles.labelled, className)}>
      {labelled && !fullscreenOnly && <span className={styles.label}>Quick display</span>}
      <div className={styles.controls}>
        <button
          type="button"
          className={cx(styles.fullscreen, fullscreen && styles.active)}
          onClick={() => void toggleFullscreen()}
          disabled={!fullscreenSupported}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
          title={fullscreenError ? 'The browser blocked full screen. Open the installed app and try again.' : fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          <Icon name={fullscreen ? 'minimize' : 'expand'} size={16} />
          {labelled && <span>{fullscreen ? 'Exit full screen' : 'Full screen'}</span>}
        </button>
        {!fullscreenOnly && <div className={styles.textScale} aria-label="Text size controls">
          <button type="button" onClick={() => changeScale(-1)} disabled={fontScale <= FONT_SCALES[0]} aria-label="Decrease text size" title="Decrease text size">A−</button>
          <button type="button" className={styles.scaleValue} onClick={() => update((current) => ({ ...current, accessibility: { ...current.accessibility, fontScale: 100 } }))} aria-label={`Text size ${fontScale} percent. Reset to 100 percent`} title="Reset text size">
            {fontScale}%
          </button>
          <button type="button" onClick={() => changeScale(1)} disabled={fontScale >= FONT_SCALES.at(-1)!} aria-label="Increase text size" title="Increase text size">A+</button>
        </div>}
      </div>
      {labelled && fullscreenError && <small className={styles.error} role="status">Full screen was blocked. Open the installed app and try again.</small>}
    </div>
  );
}
