import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Routes } from '../../../constants/routes';
import { Sidebar } from '../Sidebar';
import styles from './AppShell.module.css';

/** Top-level chrome: persistent sidebar + scrollable routed content. */
export function AppShell() {
  const navigate = useNavigate();

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
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
