import type { ReactNode } from 'react';
import { cx } from '../../../utils/cx';
import styles from './Page.module.css';

interface PageProps {
  children: ReactNode;
  /** Constrain content to the reading-width column. */
  narrow?: boolean;
  className?: string;
}

/** Standard scroll container + horizontal padding for a routed page. */
export function Page({ children, narrow = false, className }: PageProps) {
  return (
    <div className={styles.page}>
      <div className={cx(styles.inner, narrow && styles.narrow, className)}>
        {children}
      </div>
    </div>
  );
}
