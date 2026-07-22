import { useCallback, useEffect, useState } from 'react';
import { useStorage } from '../context/StorageContext';
import type { RevisionPreferences } from '../types';
import { DEFAULT_REVISION_PREFERENCES } from '../types/revision';

const CHANGE_EVENT = 'revision-engine:revision-preferences';

export function useRevisionPreferences() {
  const { storage } = useStorage();
  const [preferences, setPreferences] = useState<RevisionPreferences>(DEFAULT_REVISION_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => storage.loadRevisionPreferences().then((value) => {
      if (!active) return;
      setPreferences(value);
      setReady(true);
    });
    void load();
    const refresh = (event: Event) => {
      const next = (event as CustomEvent<RevisionPreferences>).detail;
      if (next) setPreferences(next);
      else void load();
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [storage]);

  const update = useCallback((next: RevisionPreferences) => {
    setPreferences(next);
    window.dispatchEvent(new CustomEvent<RevisionPreferences>(CHANGE_EVENT, { detail: next }));
    void storage.saveRevisionPreferences(next);
  }, [storage]);

  const toggleChapter = useCallback((chapterId: string) => {
    const ids = new Set(preferences.includedChapterIds);
    if (ids.has(chapterId)) ids.delete(chapterId);
    else ids.add(chapterId);
    update({ ...preferences, includedChapterIds: [...ids] });
  }, [preferences, update]);

  return { preferences, ready, update, toggleChapter };
}
