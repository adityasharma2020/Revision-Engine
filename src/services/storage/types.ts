/**
 * The pluggable persistence backend.
 *
 * This is the ONLY seam the rest of the app knows about for storage. React
 * code never touches localStorage, IndexedDB, Supabase, etc. — it talks to a
 * `StorageService`, which in turn delegates to a `KeyValueStore`.
 *
 * To move to the cloud later, implement `KeyValueStore` against Supabase/
 * Firebase/etc. and swap it in `createStorageService()`. Nothing else changes.
 *
 * All methods are async on purpose: localStorage is synchronous, but every
 * remote backend is not. Committing to Promises now means no caller has to be
 * rewritten when the backend becomes networked.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** All keys currently owned by this store (already namespace-stripped). */
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

export class StorageError extends Error {
  readonly key: string;

  constructor(message: string, key: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StorageError';
    this.key = key;
  }
}
