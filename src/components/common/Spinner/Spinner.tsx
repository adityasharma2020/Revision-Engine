import { cx } from '../../../utils/cx';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}

export function Spinner({ size = 20, className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={cx(styles.spinner, className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    />
  );
}
