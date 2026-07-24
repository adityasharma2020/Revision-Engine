import { useCallback, useEffect, useState } from 'react';
import { useStorage } from '../context/StorageContext';
import type { PracticePreferences } from '../types';
import { DEFAULT_PRACTICE_PREFERENCES } from '../types/revision';

const CHANGE_EVENT = 'revision-engine:practice-preferences';

/** Independent, persisted settings for unlimited practice sessions. */
export function usePracticePreferences() {
  const { storage } = useStorage();
  const [preferences, setPreferences] = useState<PracticePreferences>(DEFAULT_PRACTICE_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => storage.loadPracticePreferences().then((value) => {
      if (!active) return;
      setPreferences(value);
      setReady(true);
    });
    void load();
    const refresh = (event: Event) => {
      const next = (event as CustomEvent<PracticePreferences>).detail;
      if (next) setPreferences(next); else void load();
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [storage]);

  const update = useCallback((next: PracticePreferences) => {
    setPreferences(next);
    window.dispatchEvent(new CustomEvent<PracticePreferences>(CHANGE_EVENT, { detail: next }));
    void storage.savePracticePreferences(next);
  }, [storage]);

  return { preferences, ready, update };
}
