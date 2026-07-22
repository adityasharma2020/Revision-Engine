import type { ReactNode } from 'react';
import { cx } from '../../../utils/cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Tint the badge from an arbitrary HSL hue (used for subject colours). */
  hue?: number;
  className?: string;
}

export function Badge({ children, tone = 'neutral', hue, className }: BadgeProps) {
  const hueStyle =
    hue !== undefined
      ? ({
          '--badge-fg': `hsl(${hue} 55% 45%)`,
          '--badge-bg': `hsl(${hue} 60% 50% / 0.12)`,
        } as React.CSSProperties)
      : undefined;

  return (
    <span
      className={cx(styles.badge, styles[tone], hue !== undefined && styles.hue, className)}
      style={hueStyle}
    >
      {children}
    </span>
  );
}
