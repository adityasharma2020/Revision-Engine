import type { ReactNode } from 'react';
import type { AsyncState } from '../../../hooks/useAsync';
import { EmptyState } from '../EmptyState';
import { Spinner } from '../Spinner';
import styles from './AsyncBoundary.module.css';

interface AsyncBoundaryProps<T> {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}

/**
 * Renders the right UI for each phase of an `AsyncState`, so pages don't
 * re-implement loading/error handling. Success delegates to the render prop.
 */
export function AsyncBoundary<T>({
  state,
  children,
  loadingLabel = 'Loading…',
}: AsyncBoundaryProps<T>) {
  if (state.status === 'loading') {
    return (
      <div className={styles.center}>
        <Spinner size={24} label={loadingLabel} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="close"
        title="Something went wrong"
        description={state.error.message}
      />
    );
  }
  return <>{children(state.data)}</>;
}
