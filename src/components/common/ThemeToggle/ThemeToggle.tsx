import { useTheme } from '../../../context/ThemeContext';
import type { ThemeMode } from '../../../types';
import { cx } from '../../../utils/cx';
import { Icon, type IconName } from '../Icon';
import styles from './ThemeToggle.module.css';

const OPTIONS: ReadonlyArray<{ mode: ThemeMode; icon: IconName; label: string }> = [
  { mode: 'light', icon: 'sun', label: 'Light' },
  { mode: 'system', icon: 'monitor', label: 'System' },
  { mode: 'dark', icon: 'moon', label: 'Dark' },
];

/** Segmented light / system / dark control bound to the theme context. */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className={styles.group} role="radiogroup" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          aria-label={option.label}
          title={option.label}
          className={cx(styles.option, mode === option.mode && styles.active)}
          onClick={() => setMode(option.mode)}
        >
          <Icon name={option.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
