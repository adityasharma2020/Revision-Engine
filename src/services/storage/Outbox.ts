export interface OutboxOp {
  op: 'set' | 'remove' | 'clear';
  key?: string;
  value?: unknown;
  ts: number;
}

const OUTBOX_KEY = 'ure:sync:outbox';

/**
 * A tiny durable queue of pending remote writes, held in localStorage so it
 * survives reloads. Populated when the device is offline (or a remote write
 * fails) and drained on reconnect. Kept outside the KeyValueStore namespace so
 * it never leaks into synced state.
 */
export class Outbox {
  list(): OutboxOp[] {
    try {
      const raw = localStorage.getItem(OUTBOX_KEY);
      return raw ? (JSON.parse(raw) as OutboxOp[]) : [];
    } catch {
      return [];
    }
  }

  private write(ops: OutboxOp[]): void {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
    } catch {
      /* storage full — drop silently, local remains source of truth */
    }
  }

  enqueue(op: Omit<OutboxOp, 'ts'>): void {
    const ops = this.list();
    // Collapse repeated writes to the same key so the queue can't grow unbounded.
    const filtered =
      op.op === 'clear' ? [] : ops.filter((o) => !(o.key === op.key));
    filtered.push({ ...op, ts: Date.now() });
    this.write(filtered);
  }

  replaceAll(ops: OutboxOp[]): void {
    this.write(ops);
  }

  clear(): void {
    this.write([]);
  }
}
