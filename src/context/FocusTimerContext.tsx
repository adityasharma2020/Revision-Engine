import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActiveFocusSession, CompletedFocusSession, CompletedFocusSessionList } from '../types';
import { namespaced, StorageKeys } from '../services/storage/keys';
import { useStorage } from './StorageContext';

interface FocusTimerValue {
  ready: boolean;
  active: ActiveFocusSession | null;
  completed: CompletedFocusSessionList;
  remainingMs: number;
  elapsedMs: number;
  start: (minutes: number, rules: { allowPause: boolean; midpointNudge: boolean }) => void;
  pause: () => void;
  resume: () => void;
  markMidpointNudged: () => void;
  complete: () => void;
  discard: () => void;
}

const FocusTimerContext = createContext<FocusTimerValue | null>(null);

function normalized(session: ActiveFocusSession | null, now = Date.now()): ActiveFocusSession | null {
  if (!session) return null;
  const migrated = {
    ...session,
    allowPause: session.allowPause ?? true,
    midpointNudgeEnabled: session.midpointNudgeEnabled ?? true,
  };
  if (migrated.status !== 'running' || now < migrated.endsAt) return migrated;
  return { ...migrated, status: 'awaiting-confirmation', pausedAt: null };
}

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const { storage } = useStorage();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<ActiveFocusSession | null>(null);
  const [completed, setCompleted] = useState<CompletedFocusSessionList>([]);
  const [now, setNow] = useState(Date.now());
  const activeRef = useRef(active);
  activeRef.current = active;

  const persistActive = useCallback((next: ActiveFocusSession | null) => {
    activeRef.current = next;
    setActive(next);
    void storage.saveActiveFocusSession(next);
  }, [storage]);

  useEffect(() => {
    let live = true;
    setReady(false);
    void Promise.all([storage.loadActiveFocusSession(), storage.loadCompletedFocusSessions()]).then(([savedActive, savedCompleted]) => {
      if (!live) return;
      const restored = normalized(savedActive);
      setActive(restored);
      activeRef.current = restored;
      setCompleted(savedCompleted);
      setReady(true);
      if (restored !== savedActive) void storage.saveActiveFocusSession(restored);
    });
    return () => { live = false; };
  }, [storage]);

  useEffect(() => {
    if (!active || active.status !== 'running') return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const latest = activeRef.current;
      if (latest?.status === 'running' && current >= latest.endsAt) {
        persistActive({ ...latest, status: 'awaiting-confirmation', pausedAt: null });
        if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
          void navigator.serviceWorker?.ready.then((registration) => registration.showNotification('Focus session complete', {
            body: 'Your target is complete. Open Revision Engine to confirm it.',
            icon: `${import.meta.env.BASE_URL}app-icon-192.png`,
            badge: `${import.meta.env.BASE_URL}notification-badge.png`,
            tag: 'focus-session-complete',
          }));
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    const wake = () => tick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [active, persistActive]);

  useEffect(() => {
    const syncActive = (event: StorageEvent) => {
      if (event.key !== namespaced(StorageKeys.activeFocusSession)) return;
      const next = event.newValue ? normalized(JSON.parse(event.newValue) as ActiveFocusSession) : null;
      activeRef.current = next;
      setActive(next);
    };
    window.addEventListener('storage', syncActive);
    return () => window.removeEventListener('storage', syncActive);
  }, []);

  const start = useCallback((minutes: number, rules: { allowPause: boolean; midpointNudge: boolean }) => {
    if (activeRef.current) return;
    const startedAt = Date.now();
    const targetMs = Math.max(1, Math.min(720, minutes)) * 60_000;
    persistActive({
      id: crypto.randomUUID(), targetMs, startedAt, endsAt: startedAt + targetMs,
      status: 'running', pausedAt: null, totalPausedMs: 0, midpointNudged: false,
      allowPause: rules.allowPause, midpointNudgeEnabled: rules.midpointNudge,
    });
    setNow(startedAt);
  }, [persistActive]);

  const pause = useCallback(() => {
    const session = activeRef.current;
    if (session?.status !== 'running' || !session.allowPause) return;
    persistActive({ ...session, status: 'paused', pausedAt: Date.now() });
  }, [persistActive]);

  const resume = useCallback(() => {
    const session = activeRef.current;
    if (session?.status !== 'paused' || session.pausedAt === null) return;
    const pausedFor = Math.max(0, Date.now() - session.pausedAt);
    persistActive({ ...session, status: 'running', pausedAt: null, endsAt: session.endsAt + pausedFor, totalPausedMs: session.totalPausedMs + pausedFor });
  }, [persistActive]);

  const markMidpointNudged = useCallback(() => {
    const session = activeRef.current;
    if (!session || session.midpointNudged) return;
    persistActive({ ...session, midpointNudged: true });
  }, [persistActive]);

  const complete = useCallback(() => {
    const session = activeRef.current;
    if (session?.status !== 'awaiting-confirmation') return;
    const item: CompletedFocusSession = {
      id: session.id, targetMs: session.targetMs, creditedMs: session.targetMs,
      startedAt: session.startedAt, completedAt: Date.now(), totalPausedMs: session.totalPausedMs, outcome: 'completed',
    };
    setCompleted((previous) => {
      const next = [item, ...previous.filter((entry) => entry.id !== item.id)];
      void storage.saveCompletedFocusSessions(next);
      return next;
    });
    persistActive(null);
  }, [persistActive, storage]);

  const discard = useCallback(() => {
    const session = activeRef.current;
    if (!session) return;
    const endedAt = Date.now();
    const effectiveNow = session.status === 'paused' && session.pausedAt !== null ? session.pausedAt : endedAt;
    const remaining = Math.max(0, session.endsAt - effectiveNow);
    const focusedMs = Math.min(session.targetMs, Math.max(0, session.targetMs - remaining));
    const item: CompletedFocusSession = {
      id: session.id,
      targetMs: session.targetMs,
      creditedMs: focusedMs,
      startedAt: session.startedAt,
      completedAt: endedAt,
      totalPausedMs: session.totalPausedMs + (session.status === 'paused' && session.pausedAt !== null ? Math.max(0, endedAt - session.pausedAt) : 0),
      outcome: focusedMs >= session.targetMs ? 'completed' : 'ended-early',
    };
    setCompleted((previous) => {
      const next = [item, ...previous.filter((entry) => entry.id !== item.id)];
      void storage.saveCompletedFocusSessions(next);
      return next;
    });
    persistActive(null);
  }, [persistActive, storage]);
  const remainingMs = active ? active.status === 'paused' && active.pausedAt !== null
    ? Math.max(0, active.endsAt - active.pausedAt)
    : Math.max(0, active.endsAt - now) : 0;
  const elapsedMs = active ? Math.min(active.targetMs, Math.max(0, active.targetMs - remainingMs)) : 0;

  const value = useMemo<FocusTimerValue>(() => ({
    ready, active, completed, remainingMs, elapsedMs, start, pause, resume,
    markMidpointNudged, complete, discard,
  }), [ready, active, completed, remainingMs, elapsedMs, start, pause, resume, markMidpointNudged, complete, discard]);

  return <FocusTimerContext.Provider value={value}>{children}</FocusTimerContext.Provider>;
}

export function useFocusTimer(): FocusTimerValue {
  const value = useContext(FocusTimerContext);
  if (!value) throw new Error('useFocusTimer must be used inside FocusTimerProvider');
  return value;
}
