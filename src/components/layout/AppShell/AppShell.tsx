import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Routes } from '../../../constants/routes';
import { Sidebar } from '../Sidebar';
import styles from './AppShell.module.css';
import { cx } from '../../../utils/cx';
import { findActiveQuizDraft } from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';

const SIDEBAR_KEY = 'revision-engine:sidebar-collapsed';

/** Top-level chrome: persistent sidebar + scrollable routed content. */
export function AppShell() {
  const navigate = useNavigate();
  const [userCollapsed, setUserCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  );
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [activeQuizChapter, setActiveQuizChapter] = useState(
    () => findActiveQuizDraft()?.chapterId ?? null,
  );
  const [quizNavigationLocked, setQuizNavigationLocked] = useState(
    () => {
      const draft = findActiveQuizDraft();
      return draft?.status === 'active' && draft.settings.lockNavigation;
    },
  );
  const [navigationBlocked, setNavigationBlocked] = useState(false);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ chapterId: string | null; locked: boolean }>).detail;
      setActiveQuizChapter(detail.chapterId);
      setQuizNavigationLocked(detail.locked);
      if (!detail.chapterId) setNavigationBlocked(false);
    };
    window.addEventListener('revision-engine:quiz-lock', update);
    return () => window.removeEventListener('revision-engine:quiz-lock', update);
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const setCollapsed = (collapsed: boolean) => {
    setUserCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  };

  const collapsed = userCollapsed || fullscreen;

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (editing) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        navigate(Routes.search);
      }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, [navigate]);

  return (
    <div
      className={cx(styles.shell, collapsed && styles.collapsed)}
      onClickCapture={(event) => {
        if (!activeQuizChapter || !quizNavigationLocked) return;
        const target = event.target as HTMLElement;
        const link = target.closest('a[href]');
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        setNavigationBlocked(true);
      }}
    >
      <Sidebar
        collapsed={collapsed}
        collapseLocked={fullscreen}
        onToggle={() => setCollapsed(!userCollapsed)}
      />
      <main className={styles.main}>
        <Outlet />
      </main>
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
            <p>Submit the active timed quiz before navigating elsewhere. This prevents overlapping attempts and inaccurate timing.</p>
            <Button variant="primary" onClick={() => setNavigationBlocked(false)}>Continue quiz</Button>
          </section>
        </div>
      )}
    </div>
  );
}
