import { useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * Run an async task tied to component lifecycle, exposing an explicit state
 * machine (loading | success | error). Re-runs when `deps` change and ignores
 * results from stale runs to avoid setState-after-unmount and race conditions.
 */
export function useAsync<T>(
  task: () => Promise<T>,
  deps: React.DependencyList,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    task().then(
      (data) => {
        if (active) setState({ status: 'success', data, error: null });
      },
      (error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
