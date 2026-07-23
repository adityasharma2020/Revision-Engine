import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Routes } from '../../../constants/routes';
import { Sidebar } from '../Sidebar';
import styles from './AppShell.module.css';
import { cx } from '../../../utils/cx';
import { abandonQuizDraft, findActiveQuizDraft } from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { Search } from '../../../pages/Search';
import { StoragePressureNudge } from '../StoragePressureNudge';
import { useAuth } from '../../../context/AuthContext';
import { disableWebPush, getPushStatus, syncWebPushSubscription } from '../../../services/notifications';
import { useDeviceNotificationSettings } from '../../../context/DeviceNotificationSettingsContext';
import { FocusTimerWidget } from '../../focus/FocusTimerWidget';

const SIDEBAR_KEY = 'revision-engine:sidebar-collapsed';
const QUIZ_HISTORY_GUARD = '__revisionEngineQuizGuard';

function isQuizGuardState(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === 'object'
    && QUIZ_HISTORY_GUARD in state
    && (state as Record<string, unknown>)[QUIZ_HISTORY_GUARD] === true,
  );
}

function armQuizHistoryGuard(): void {
  if (isQuizGuardState(window.history.state)) return;
  const state = window.history.state && typeof window.history.state === 'object'
    ? window.history.state as Record<string, unknown>
    : {};
  window.history.pushState(
    { ...state, [QUIZ_HISTORY_GUARD]: true },
    '',
    window.location.href,
  );
}

/** Top-level chrome: persistent sidebar + scrollable routed content. */
export function AppShell() {
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const { settings: deviceNotifications, ready: deviceNotificationsReady, update: updateDeviceNotifications } = useDeviceNotificationSettings();
  const [userCollapsed, setUserCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  );
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [activeQuizId, setActiveQuizId] = useState(
    () => findActiveQuizDraft()?.quizId ?? null,
  );
  const [quizNavigationLocked, setQuizNavigationLocked] = useState(
    () => {
      const draft = findActiveQuizDraft();
      return draft?.status === 'active' && draft.settings.lockNavigation;
    },
  );
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const [blockedDestination, setBlockedDestination] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!deviceNotificationsReady || authStatus !== 'authenticated' || !deviceNotifications.enabled) return;

    const reconcile = () => {
      const pushStatus = getPushStatus(true);
      if (pushStatus === 'denied') {
        const next = { ...deviceNotifications, enabled: false };
        updateDeviceNotifications(next);
        void disableWebPush(next).catch(() => undefined);
        return;
      }
      if (pushStatus !== 'granted') return;
      void syncWebPushSubscription(deviceNotifications).catch((error) => {
        console.warn('[push] Could not reconcile this device subscription.', error);
      });
    };

    const timer = window.setTimeout(reconcile, 200);
    window.addEventListener('online', reconcile);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', reconcile);
    };
  }, [authStatus, deviceNotifications, deviceNotificationsReady, updateDeviceNotifications]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ quizId: string | null; locked: boolean }>).detail;
      setActiveQuizId(detail.quizId);
      setQuizNavigationLocked(detail.locked);
      if (!detail.quizId) setNavigationBlocked(false);
    };
    window.addEventListener('revision-engine:quiz-lock', update);
    return () => window.removeEventListener('revision-engine:quiz-lock', update);
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    const guardPageExit = (event: BeforeUnloadEvent) => {
      const draft = findActiveQuizDraft();
      if (draft?.status !== 'active' || !draft.settings.lockNavigation) return;
      event.preventDefault();
      // A truthy returnValue is still required by some browser versions.
      event.returnValue = true;
    };

    // Keep this listener mounted for the lifetime of the app. Reading the
    // draft at event time avoids a stale React-state window during navigation.
    window.addEventListener('beforeunload', guardPageExit, { capture: true });
    return () => window.removeEventListener('beforeunload', guardPageExit, { capture: true });
  }, []);

  useEffect(() => {
    if (!activeQuizId || !quizNavigationLocked) return;

    armQuizHistoryGuard();

    const guardBrowserHistory = (event: PopStateEvent) => {
      // history.forward() below returns to our sentinel and emits popstate.
      if (isQuizGuardState(event.state)) return;

      const attemptedDestination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setBlockedDestination(attemptedDestination);
      setNavigationBlocked(true);

      // popstate itself cannot be cancelled. The sentinel guarantees that the
      // previous entry is still this quiz document, so moving forward restores
      // the protected entry before another app route can become active.
      window.history.forward();
    };
    window.addEventListener('popstate', guardBrowserHistory, { capture: true });
    return () => window.removeEventListener('popstate', guardBrowserHistory, { capture: true });
  }, [activeQuizId, quizNavigationLocked]);

  const setCollapsed = (collapsed: boolean) => {
    setUserCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  };

  const collapsed = userCollapsed || fullscreen;

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape, { capture: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape, { capture: true });
    };
  }, [searchOpen]);

  const resumeActiveQuiz = () => {
    const draft = findActiveQuizDraft();
    const quizId = draft?.quizId ?? activeQuizId;
    setNavigationBlocked(false);
    setBlockedDestination(null);
    if (quizId) {
      navigate(Routes.activeQuiz(quizId), { replace: true });
      window.setTimeout(armQuizHistoryGuard, 0);
    }
  };

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const commandKey = event.metaKey || event.ctrlKey;
      const commandSearch = commandKey && (
        (!event.shiftKey && event.key.toLowerCase() === 'k')
        || (event.shiftKey && event.key.toLowerCase() === 'p')
      );
      const slashSearch = !editing && !commandKey && event.key === '/';

      if (!commandSearch && !slashSearch) return;

      event.preventDefault();
      if (activeQuizId && quizNavigationLocked) {
        setBlockedDestination(Routes.search);
        setNavigationBlocked(true);
        return;
      }
      setSearchOpen(true);
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, [activeQuizId, navigate, quizNavigationLocked]);

  return (
    <div
      className={cx(styles.shell, collapsed && styles.collapsed)}
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        const link = target.closest('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        const searchLink = href?.split(/[?#]/)[0] === Routes.search;
        if (searchLink) {
          event.preventDefault();
          event.stopPropagation();
          if (activeQuizId && quizNavigationLocked) {
            setBlockedDestination(href);
            setNavigationBlocked(true);
          } else {
            setSearchOpen(true);
          }
          return;
        }
        if (!activeQuizId || !quizNavigationLocked) return;
        event.preventDefault();
        event.stopPropagation();
        setBlockedDestination(href);
        setNavigationBlocked(true);
      }}
    >
      <Sidebar
        collapsed={collapsed}
        collapseLocked={fullscreen}
        searchOpen={searchOpen}
        onToggle={() => setCollapsed(!userCollapsed)}
      />
      <main className={styles.main}>
        <Outlet />
      </main>
      <StoragePressureNudge />
      <FocusTimerWidget />
      {searchOpen && (
        <div className={styles.searchBackdrop} onMouseDown={() => setSearchOpen(false)}>
          <section
            className={styles.searchDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-search-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.searchHeader}>
              <div>
                <span>Knowledge search</span>
                <h2 id="global-search-title">Search your library</h2>
                <p>Find chapters, questions, answers, explanations and tags.</p>
              </div>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search">
                <Icon name="close" size={20} />
              </button>
            </header>
            <div className={styles.searchBody}>
              <Search overlay onNavigate={() => setSearchOpen(false)} />
            </div>
          </section>
        </div>
      )}
      {navigationBlocked && (
        <div className={styles.guardBackdrop} onMouseDown={() => setNavigationBlocked(false)}>
          <section
            className={styles.guardModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-navigation-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className={styles.guardIcon}><Icon name="clock" size={20} /></span>
            <h2 id="quiz-navigation-title">Quiz in progress</h2>
            <p>
              Submit the active timed quiz before navigating elsewhere. This
              prevents overlapping attempts and inaccurate timing.
            </p>
            <div className={styles.guardActions}>
              <Button variant="primary" onClick={resumeActiveQuiz}>Continue quiz</Button>
              {findActiveQuizDraft()?.settings.allowQuit && activeQuizId && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    abandonQuizDraft(activeQuizId);
                    setNavigationBlocked(false);
                    setActiveQuizId(null);
                    setQuizNavigationLocked(false);
                    if (blockedDestination) navigate(blockedDestination);
                  }}
                >
                  Quit quiz and leave
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
