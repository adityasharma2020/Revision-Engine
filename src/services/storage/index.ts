import { LocalStorageStore } from './LocalStorageStore';
import { StorageService } from './StorageService';

export { StorageService, DEFAULT_SETTINGS } from './StorageService';
export type { AppSettings } from './StorageService';
export type { KeyValueStore } from './types';
export { StorageError } from './types';

/**
 * Compose the concrete storage stack for the running app.
 *
 * This is the ONE place that decides which backend is active. To go cloud,
 * replace `new LocalStorageStore()` with e.g. `new SupabaseStore(client)` —
 * no other file changes.
 */
export function createStorageService(): StorageService {
  return new StorageService(new LocalStorageStore());
}
