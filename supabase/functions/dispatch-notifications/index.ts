import { adminClient, deliver, type PushPayload, type SubscriptionRow } from '../_shared/push.ts';

type NotificationPreferences = {
  enabled?: boolean;
  dailyRevision?: boolean;
  weeklySummary?: boolean;
  milestones?: boolean;
  dailyReminderTime?: string;
  weeklySummaryDay?: number;
  weeklySummaryTime?: string;
  timezone?: string;
};

function localParts(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}`, weekday: weekdays[value('weekday')] ?? 0 };
}

function isDue(current: string, configured = '18:00') {
  const [hour, minute] = current.split(':').map(Number);
  const [targetHour, targetMinute] = configured.split(':').map(Number);
  const delta = hour * 60 + minute - (targetHour * 60 + targetMinute);
  return delta >= 0 && delta < 15;
}

Deno.serve(async (request) => {
  if (request.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('Unauthorized', { status: 401 });
  const admin = adminClient();
  const { data: settingRows, error } = await admin.from('user_state').select('user_id,value').eq('key', 'settings').eq('is_deleted', false);
  if (error) throw error;
  let delivered = 0;
  for (const row of settingRows ?? []) {
    const preferences = (row.value?.notifications ?? {}) as NotificationPreferences;
    if (!preferences.enabled) continue;
    let clock: ReturnType<typeof localParts>;
    try { clock = localParts(preferences.timezone || 'UTC'); } catch { clock = localParts('UTC'); }
    const messages: Array<{ type: string; key: string; payload: PushPayload }> = [];
    let cachedResults: Array<Record<string, unknown>> | null = null;
    const getResults = async () => {
      if (cachedResults) return cachedResults;
      const { data } = await admin.from('user_state').select('value').eq('user_id', row.user_id).eq('key', 'quiz-results').eq('is_deleted', false).maybeSingle();
      cachedResults = Array.isArray(data?.value) ? data.value.filter((item) => item.includedInAnalytics !== false && item.isDeleted !== 1) : [];
      return cachedResults;
    };
    if (preferences.dailyRevision && isDue(clock.time, preferences.dailyReminderTime)) {
      const { data: assignment } = await admin.from('user_state').select('value').eq('user_id', row.user_id).eq('key', 'daily-revision-assignment').eq('is_deleted', false).maybeSingle();
      if (assignment?.value?.status !== 'completed' || assignment.value?.dateKey !== clock.date) messages.push({ type: 'daily-revision', key: clock.date, payload: { title: 'Daily revision is waiting', body: 'A short review now will keep your learning rhythm intact.', tag: `daily-${clock.date}`, url: 'revision' } });
    }
    if (preferences.weeklySummary && clock.weekday === (preferences.weeklySummaryDay ?? 0) && isDue(clock.time, preferences.weeklySummaryTime)) {
      const since = Date.now() - 7 * 86_400_000;
      const results = (await getResults()).filter((item) => Number(item.takenAt) >= since);
      const questions = results.reduce((sum, item) => sum + Number(item.totalQuestions ?? 0), 0);
      messages.push({ type: 'weekly-summary', key: clock.date, payload: { title: 'Your weekly progress', body: `${questions} questions across ${results.length} ${results.length === 1 ? 'quiz' : 'quizzes'} this week.`, tag: `weekly-${clock.date}`, url: 'statistics' } });
    }
    if (preferences.milestones) {
      const lifetimeQuestions = (await getResults()).reduce((sum, item) => sum + Number(item.totalQuestions ?? 0), 0);
      const milestone = Math.floor(lifetimeQuestions / 100) * 100;
      if (milestone >= 100) messages.push({ type: 'milestone', key: `questions-${milestone}`, payload: { title: `${milestone} questions completed`, body: 'A meaningful learning milestone—keep building on it.', tag: `milestone-${milestone}`, url: 'statistics' } });
    }
    if (!messages.length) continue;
    const { data: subscriptions } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key').eq('user_id', row.user_id).is('disabled_at', null);
    for (const message of messages) for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
      const { data: existing } = await admin.from('notification_deliveries').select('id').eq('user_id', row.user_id).eq('notification_type', message.type).eq('dedupe_key', message.key).eq('subscription_id', subscription.id).maybeSingle();
      if (existing) continue;
      try {
        await deliver(subscription, message.payload);
        await admin.from('notification_deliveries').insert({ user_id: row.user_id, subscription_id: subscription.id, notification_type: message.type, dedupe_key: message.key });
        delivered += 1;
      } catch (pushError) {
        const status = typeof pushError === 'object' && pushError && 'statusCode' in pushError ? Number(pushError.statusCode) : 0;
        if (status === 404 || status === 410) await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', subscription.id);
      }
    }
  }
  return Response.json({ delivered });
});
