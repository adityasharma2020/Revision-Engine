import type { SupabaseKeyValueStore } from '../supabase/SupabaseKeyValueStore';
import { Outbox, type OutboxOp } from './Outbox';
import type { KeyValueStore } from './types';

/**
 * Offline-first KeyValueStore for signed-in users.
 *
 * Reads and writes hit the LOCAL store first, so the UI is instant and works
 * with no connection. Every write is mirrored to the remote store; if that
 * fails (offline or error) it is queued in the Outbox and flushed on reconnect.
 * `sync()` reconciles local ↔ remote on sign-in and when connectivity returns.
 *
 * Internal keys (prefixed `__`) are never mirrored or hydrated.
 */
export class SyncedKeyValueStore implements KeyValueStore {
  private readonly local: KeyValueStore;
  private readonly remote: SupabaseKeyValueStore;
  private readonly outbox = new Outbox();

  constructor(local: KeyValueStore, remote: SupabaseKeyValueStore) {
    this.local = local;
    this.remote = remote;
  }

  private get online(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.local.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.local.set(key, value);
    await this.mirror({ op: 'set', key, value });
  }

  async remove(key: string): Promise<void> {
    await this.local.remove(key);
    await this.mirror({ op: 'remove', key });
  }

  async keys(): Promise<string[]> {
    return this.local.keys();
  }

  async clear(): Promise<void> {
    await this.local.clear();
    await this.mirror({ op: 'clear' });
  }

  // ---- Remote mirroring -------------------------------------------------
  private async mirror(op: Omit<OutboxOp, 'ts'>): Promise<void> {
    if (!this.online) {
      this.outbox.enqueue(op);
      return;
    }
    try {
      await this.apply(op);
    } catch {
      this.outbox.enqueue(op);
    }
  }

  private async apply(op: Pick<OutboxOp, 'op' | 'key' | 'value'>): Promise<void> {
    if (op.op === 'set') await this.remote.set(op.key!, op.value);
    else if (op.op === 'remove') await this.remote.remove(op.key!);
    else await this.remote.clear();
  }

  /** Replay queued writes, in order, stopping on the first failure. */
  async flush(): Promise<void> {
    if (!this.online) return;
    const remaining = this.outbox.list();
    while (remaining.length > 0) {
      try {
        await this.apply(remaining[0]);
        remaining.shift();
        this.outbox.replaceAll(remaining);
      } catch {
        break;
      }
    }
  }

  /** Pull the full remote snapshot into the local cache. */
  private async hydrate(): Promise<void> {
    const snapshot = await this.remote.snapshot();
    for (const [key, value] of Object.entries(snapshot)) {
      if (key.startsWith('__')) continue;
      await this.local.set(key, value);
    }
  }

  /** Push existing local (guest) data up when the account has none yet. */
  private async migrateLocalToRemote(): Promise<void> {
    const keys = await this.local.keys();
    for (const key of keys) {
      if (key.startsWith('__')) continue;
      const value = await this.local.get(key);
      if (value !== null) await this.remote.set(key, value);
    }
  }

  /**
   * Reconcile on sign-in / reconnect: if the account is empty, seed it from
   * local (guest → account migration); otherwise the account is authoritative
   * and we hydrate the local cache from it. Then flush any queued writes.
   */
  async sync(): Promise<void> {
    if (!this.online) return;
    // Push queued local changes first so a stale cloud snapshot cannot replace
    // newer offline work in the local cache.
    await this.flush();
    const remoteKeys = await this.remote.keys();
    if (remoteKeys.length === 0) {
      await this.migrateLocalToRemote();
    } else {
      await this.hydrate();
    }
  }
}
