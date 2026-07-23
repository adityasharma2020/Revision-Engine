import { namespaced, STORAGE_NAMESPACE } from './keys';
import { StorageError, type KeyValueStore } from './types';

/**
 * `KeyValueStore` backed by the browser's localStorage.
 *
 * - Keys are namespaced so we own a clean slice of the origin's storage.
 * - Values are JSON-serialised.
 * - Failures (quota exceeded, disabled storage, corrupt JSON) are surfaced as
 *   `StorageError` rather than throwing raw DOM exceptions, so callers can
 *   degrade gracefully.
 */
export class LocalStorageStore implements KeyValueStore {
  private get backend(): Storage {
    if (typeof localStorage === 'undefined') {
      throw new StorageError('localStorage is unavailable', '');
    }
    return localStorage;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.backend.getItem(namespaced(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (cause) {
      throw new StorageError(`Corrupt data for "${key}"`, key, cause);
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      this.backend.setItem(namespaced(key), JSON.stringify(value));
      window.dispatchEvent(new Event('revision-engine:storage-change'));
    } catch (cause) {
      throw new StorageError(`Failed to write "${key}"`, key, cause);
    }
  }

  async remove(key: string): Promise<void> {
    this.backend.removeItem(namespaced(key));
    window.dispatchEvent(new Event('revision-engine:storage-change'));
  }

  async keys(): Promise<string[]> {
    const prefix = `${STORAGE_NAMESPACE}:`;
    const result: string[] = [];
    for (let i = 0; i < this.backend.length; i += 1) {
      const full = this.backend.key(i);
      if (full?.startsWith(prefix)) {
        // Strip `ns:vN:` — the last colon-delimited segment is the logical key.
        result.push(full.slice(full.indexOf(':', prefix.length) + 1));
      }
    }
    return result;
  }

  async clear(): Promise<void> {
    const prefix = `${STORAGE_NAMESPACE}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < this.backend.length; i += 1) {
      const full = this.backend.key(i);
      if (full?.startsWith(prefix)) toRemove.push(full);
    }
    toRemove.forEach((k) => this.backend.removeItem(k));
    window.dispatchEvent(new Event('revision-engine:storage-change'));
  }
}
