import { useEffect, useState } from 'react';

/**
 * Live elapsed-time readout for a running stopwatch.
 *
 * `startedAt` is the authoritative session start (epoch ms); this hook simply
 * re-renders on a timer so the displayed value ticks while `running`. The true
 * duration is always derived from timestamps, never accumulated here.
 */
export function useElapsed(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || startedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
