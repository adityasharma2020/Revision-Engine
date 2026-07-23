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
  let items = (data ?? []).map((row) => ({ id: Number(row.id), type: String(row.notification_type), title: String(row.title), body: String(row.body), url: String(row.url ?? ''), metadata: (row.metadata ?? {}) as Record<string, unknown>, deliveredAt: String(row.delivered_at), readAt: row.read_at ? String(row.read_at) : null }));

  // Repair notifications reviewed before review actions began updating the
  // inbox directly. Only feedback newer than that delivery resolves it, so a
  // past review cannot hide a genuinely new reminder for the same nudge.
  const unreadNudgeIds = [...new Set(items
    .filter((item) => !item.readAt && item.metadata.nudgeId)
    .map((item) => String(item.metadata.nudgeId)))];
  if (unreadNudgeIds.length) {
    const { data: feedback } = await client()
      .from('nudge_interactions')
      .select('nudge_id,action,created_at')
      .in('nudge_id', unreadNudgeIds)
      .in('action', ['remembered', 'forgot', 'snooze', 'archive']);
    const resolvedIds = items
      .filter((item) => {
        if (item.readAt || !item.metadata.nudgeId) return false;
        return (feedback ?? []).some((entry) => (
          String(entry.nudge_id) === String(item.metadata.nudgeId)
          && new Date(String(entry.created_at)).getTime() >= new Date(item.deliveredAt).getTime()
        ));
      })
      .map((item) => item.id);
    if (resolvedIds.length) {
      await markInboxRead(resolvedIds);
      const readAt = new Date().toISOString();
      items = items.map((item) => resolvedIds.includes(item.id) ? { ...item, readAt } : item);
    }
  }
  return items;
}

export async function markInboxRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await client().from('notification_inbox').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
  if (error) throw error;
}

/** A completed nudge review resolves every unread delivery for that nudge. */
export async function markNudgeInboxRead(nudgeId: string): Promise<void> {
  const { error } = await client()
    .from('notification_inbox')
    .update({ read_at: new Date().toISOString() })
    .contains('metadata', { nudgeId })
    .is('read_at', null);
  if (error) throw error;
  window.dispatchEvent(new CustomEvent('revision-engine:notifications-changed'));
}
