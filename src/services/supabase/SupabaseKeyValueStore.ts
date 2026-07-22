import type { SupabaseClient } from '@supabase/supabase-js';
import { StorageError, type KeyValueStore } from '../storage/types';

const TABLE = 'user_state';

/**
 * `KeyValueStore` backed by the `user_state` table. Because the app's storage
 * seam is already key/value, Supabase slots in as just another backend — RLS
 * guarantees every row is scoped to the signed-in user.
 */
export class SupabaseKeyValueStore implements KeyValueStore {
  private readonly client: SupabaseClient;
  private readonly userId: string;

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async get<T>(key: string): Promise<T | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('value')
      .eq('user_id', this.userId)
      .eq('key', key)
      .maybeSingle();
    if (error) throw new StorageError(`Remote read failed for "${key}"`, key, error);
    return (data?.value as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .upsert(
        { user_id: this.userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' },
      );
    if (error) throw new StorageError(`Remote write failed for "${key}"`, key, error);
  }

  async remove(key: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq('user_id', this.userId)
      .eq('key', key);
    if (error) throw new StorageError(`Remote delete failed for "${key}"`, key, error);
  }

  async keys(): Promise<string[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('key')
      .eq('user_id', this.userId);
    if (error) throw new StorageError('Remote key listing failed', '', error);
    return (data ?? []).map((row) => row.key as string);
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from(TABLE).delete().eq('user_id', this.userId);
    if (error) throw new StorageError('Remote clear failed', '', error);
  }

  /** Snapshot every key/value for this user — used to hydrate the local cache. */
  async snapshot(): Promise<Record<string, unknown>> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('key, value')
      .eq('user_id', this.userId);
    if (error) throw new StorageError('Remote snapshot failed', '', error);
    const out: Record<string, unknown> = {};
    for (const row of data ?? []) out[row.key as string] = row.value;
    return out;
  }
}
