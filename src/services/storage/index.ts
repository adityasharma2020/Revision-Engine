import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseKeyValueStore } from '../supabase/SupabaseKeyValueStore';
import { LocalStorageStore } from './LocalStorageStore';
import { StorageService } from './StorageService';
import { SyncedKeyValueStore } from './SyncedKeyValueStore';

export { StorageService, DEFAULT_SETTINGS } from './StorageService';
export type { AppSettings } from './StorageService';
export type { KeyValueStore } from './types';
export { StorageError } from './types';
export { LocalStorageStore } from './LocalStorageStore';
export { SyncedKeyValueStore } from './SyncedKeyValueStore';

/** Local-only storage stack (guest mode / no Supabase). */
export function createLocalStorageService(): StorageService {
  return new StorageService(new LocalStorageStore());
}

export interface SyncedStorage {
  service: StorageService;
  store: SyncedKeyValueStore;
}

/**
 * Offline-first synced storage for a signed-in user. The returned `store`
 * exposes `sync()` for the StorageContext to call on sign-in / reconnect.
 */
export function createSyncedStorageService(
  client: SupabaseClient,
  userId: string,
): SyncedStorage {
  const store = new SyncedKeyValueStore(
    new LocalStorageStore(),
    new SupabaseKeyValueStore(client, userId),
  );
  return { service: new StorageService(store), store };
}

/** Backwards-compatible default (local). */
export function createStorageService(): StorageService {
  return createLocalStorageService();
}
