import { useCallback, useEffect, useState } from 'react';
import { useStorage } from '../context/StorageContext';
import type { DailyRevisionAssignment } from '../types';

const CHANGE_EVENT = 'revision-engine:daily-assignment';

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useDailyRevisionAssignment() {
  const { storage } = useStorage();
  const [assignment, setAssignment] = useState<DailyRevisionAssignment | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void storage.loadDailyRevisionAssignment().then((value) => {
      if (!active) return;
      setAssignment(value?.dateKey === localDateKey() ? value : null);
      setReady(true);
    });
    const refresh = (event: Event) => {
      const value = (event as CustomEvent<DailyRevisionAssignment | null>).detail;
      setAssignment(value?.dateKey === localDateKey() ? value : null);
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [storage]);

  const save = useCallback((next: DailyRevisionAssignment) => {
    setAssignment(next);
    window.dispatchEvent(new CustomEvent<DailyRevisionAssignment>(CHANGE_EVENT, { detail: next }));
    void storage.saveDailyRevisionAssignment(next);
  }, [storage]);

  const clear = useCallback(() => {
    setAssignment(null);
    window.dispatchEvent(new CustomEvent<DailyRevisionAssignment | null>(CHANGE_EVENT, { detail: null }));
    void storage.clearDailyRevisionAssignment();
  }, [storage]);

  return { assignment, ready, save, clear };
}
