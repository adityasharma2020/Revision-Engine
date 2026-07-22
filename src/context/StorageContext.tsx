import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  StorageService,
  createLocalStorageService,
  createSyncedStorageService,
} from '../services/storage';
import type { SyncedKeyValueStore } from '../services/storage';
import { getSupabase } from '../services/supabase/client';
import { useAuth } from './AuthContext';

interface StorageValue {
  /** The active storage facade — local for guests, synced when signed in. */
  storage: StorageService;
  /** True while an initial sign-in reconciliation is in flight. */
  syncing: boolean;
  online: boolean;
}

const StorageContext = createContext<StorageValue | null>(null);

interface Active {
  service: StorageService;
  store: SyncedKeyValueStore | null;
}

/**
 * Chooses and manages the storage backend based on auth state. Consumers
 * (theme, user data) read `storage` and reload whenever its identity changes —
 * which is exactly when we swap backends or finish hydrating from the cloud.
 */
export function StorageProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [active, setActive] = useState<Active>(() => ({
    service: createLocalStorageService(),
    store: null,
  }));
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  const userId = status === 'authenticated' ? user?.id : undefined;

  useEffect(() => {
    let cancelled = false;
    const client = getSupabase();

    if (userId && client) {
      const { service, store } = createSyncedStorageService(client, userId);
      // Writes are synced immediately; reload once with hydrated data.
      setActive({ service, store });
      setSyncing(true);
      store
        .sync()
        .then(() => {
          if (!cancelled) setActive({ service: new StorageService(store), store });
        })
        .catch((err) => {
          // Sync failing (e.g. tables/grants not set up yet, or offline) must
          // never break the app — local storage remains fully functional.
          console.warn('[storage] cloud sync unavailable, using local only:', err);
        })
        .finally(() => {
          if (!cancelled) setSyncing(false);
        });
    } else {
      setActive({ service: createLocalStorageService(), store: null });
    }

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-sync + flush the outbox when connectivity returns.
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      const store = active.store;
      if (!store) return;
      store
        .sync()
        .then(() => setActive((a) => ({ ...a, service: new StorageService(store) })))
        .catch((err) => console.warn('[storage] reconnect sync failed:', err));
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [active.store]);

  const value = useMemo<StorageValue>(
    () => ({ storage: active.service, syncing, online }),
    [active.service, syncing, online],
  );

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useStorage must be used within a <StorageProvider>');
  return ctx;
}
