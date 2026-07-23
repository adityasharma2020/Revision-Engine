import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '../services/storage';
import { useStorage } from './StorageContext';

interface AppSettingsValue {
  settings: AppSettings;
  ready: boolean;
  update: (next: AppSettings | ((current: AppSettings) => AppSettings)) => void;
  reset: () => void;
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

/** Single source of truth for small, independent app-wide feature preferences. */
export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { storage } = useStorage();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    void storage.loadSettings().then((stored) => {
      if (!active) return;
      setSettings(stored);
      setReady(true);
    });
    return () => { active = false; };
  }, [storage]);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduce-motion', settings.accessibility.reduceMotion);
  }, [settings.accessibility.reduceMotion]);

  const update = useCallback((next: AppSettings | ((current: AppSettings) => AppSettings)) => {
    setSettings((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      void storage.saveSettings(value);
      return value;
    });
  }, [storage]);

  const reset = useCallback(() => update(DEFAULT_SETTINGS), [update]);
  const value = useMemo(() => ({ settings, ready, update, reset }), [settings, ready, update, reset]);
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return value;
}
