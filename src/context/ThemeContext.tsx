import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ResolvedTheme, ThemeMode } from '../types';
import { applyTheme, resolveTheme, watchSystemTheme } from '../utils/theme';
import { useStorage } from './StorageContext';

interface ThemeContextValue {
  /** The user's preference: 'light' | 'dark' | 'system'. */
  mode: ThemeMode;
  /** The concrete theme currently applied. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Convenience toggle between light and dark (resolves 'system' first). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_MODE: ThemeMode = 'system';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { storage } = useStorage();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(DEFAULT_MODE),
  );

  // Hydrate the persisted preference once on mount.
  useEffect(() => {
    let active = true;
    storage.loadTheme().then((stored) => {
      if (active && stored) setModeState(stored);
    });
    return () => {
      active = false;
    };
  }, [storage]);

  // Apply + persist whenever the mode changes, and track the OS while 'system'.
  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);
    applyTheme(next);

    if (mode !== 'system') return;
    return watchSystemTheme((theme) => {
      setResolved(theme);
      applyTheme(theme);
    });
  }, [mode]);

  const value = useMemo<ThemeContextValue>(() => {
    const setMode = (next: ThemeMode) => {
      setModeState(next);
      void storage.saveTheme(next);
    };
    return {
      mode,
      resolved,
      setMode,
      toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
    };
  }, [mode, resolved, storage]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>');
  return ctx;
}
