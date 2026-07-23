import { getSupabase } from '../supabase/client';

export interface InboxNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  metadata: Record<string, unknown>;
  deliveredAt: string;
  readAt: string | null;
}

const client = () => {
  const value = getSupabase();
  if (!value) throw new Error('Supabase is required for notification history.');
  return value;
};

export async function listInboxNotifications(limit = 50): Promise<InboxNotification[]> {
  const { data, error } = await client().from('notification_inbox').select('*').order('delivered_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: Number(row.id), type: String(row.notification_type), title: String(row.title), body: String(row.body), url: String(row.url ?? ''), metadata: (row.metadata ?? {}) as Record<string, unknown>, deliveredAt: String(row.delivered_at), readAt: row.read_at ? String(row.read_at) : null }));
}

export async function markInboxRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await client().from('notification_inbox').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
  if (error) throw error;
}
