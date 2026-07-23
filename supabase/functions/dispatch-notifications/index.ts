import { adminClient, deliver, type PushPayload, type SubscriptionRow } from '../_shared/push.ts';
import { chooseMotivation, loadMotivationFeed, resolveMotivationImage, type MotivationTone } from '../_shared/motivation.ts';

type NotificationPreferences = {
  enabled?: boolean;
  dailyRevision?: boolean;
  weeklySummary?: boolean;
  milestones?: boolean;
  memoryNudges?: boolean;
  motivation?: boolean;
  motivationTime?: string;
  motivationDays?: number[];
  motivationTone?: MotivationTone | 'mixed';
  motivationImages?: boolean;
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

function inRange(current: string, start: string, end: string) {
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function weightedPick(items: Array<Record<string, unknown>>) {
  const weighted = items.map((item) => {
    const priority = Number(item.priority ?? 3);
    const forgotten = Number(item.forgotten_count ?? 0);
    const remembered = Number(item.remembered_count ?? 0);
    const elapsedDays = item.last_sent_at ? Math.max(0, (Date.now() - new Date(String(item.last_sent_at)).getTime()) / 86_400_000) : 14;
    return { item, weight: priority * (1 + forgotten / (remembered + 1)) * (1 + Math.min(elapsedDays, 30) / 30) };
  });
  let cursor = Math.random() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of weighted) { cursor -= entry.weight; if (cursor <= 0) return entry.item; }
  return weighted.at(-1)?.item;
}

Deno.serve(async (request) => {
  if (request.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('Unauthorized', { status: 401 });
  const admin = adminClient();
  const { data: deviceRows, error } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key,preferences').is('disabled_at', null);
  if (error) throw error;
  let delivered = 0;
  for (const subscription of (deviceRows ?? []) as SubscriptionRow[]) {
    const preferences = (subscription.preferences ?? {}) as NotificationPreferences;
    if (!preferences.enabled) continue;
    let clock: ReturnType<typeof localParts>;
    try { clock = localParts(preferences.timezone || 'UTC'); } catch { clock = localParts('UTC'); }
    const messages: Array<{ type: string; key: string; payload: PushPayload; inboxBody?: string; metadata?: Record<string, unknown> }> = [];
    let cachedResults: Array<Record<string, unknown>> | null = null;
    const getResults = async () => {
      if (cachedResults) return cachedResults;
      const { data } = await admin.from('user_state').select('value').eq('user_id', subscription.user_id).eq('key', 'quiz-results').eq('is_deleted', false).maybeSingle();
      cachedResults = Array.isArray(data?.value) ? data.value.filter((item) => item.includedInAnalytics !== false && item.isDeleted !== 1) : [];
      return cachedResults;
    };
    if (preferences.dailyRevision && isDue(clock.time, preferences.dailyReminderTime)) {
      const { data: assignment } = await admin.from('user_state').select('value').eq('user_id', subscription.user_id).eq('key', 'daily-revision-assignment').eq('is_deleted', false).maybeSingle();
      if (assignment?.value?.status !== 'completed' || assignment.value?.dateKey !== clock.date) messages.push({ type: 'daily-revision', key: clock.date, payload: { title: '🎯 Your daily review is ready', body: 'A few focused questions now will protect what you’ve already learned.', tag: `daily-${clock.date}`, url: 'revision', actions: [{ action: 'start-review', title: 'Start review', url: 'revision' }] } });
    }
    if (preferences.weeklySummary && clock.weekday === (preferences.weeklySummaryDay ?? 0) && isDue(clock.time, preferences.weeklySummaryTime)) {
      const since = Date.now() - 7 * 86_400_000;
      const results = (await getResults()).filter((item) => Number(item.takenAt) >= since);
      const questions = results.reduce((sum, item) => sum + Number(item.totalQuestions ?? 0), 0);
      messages.push({ type: 'weekly-summary', key: clock.date, payload: { title: '📊 Your week in learning', body: `${questions} questions · ${results.length} ${results.length === 1 ? 'quiz' : 'quizzes'} completed. See how your consistency is building.`, tag: `weekly-${clock.date}`, url: 'statistics', actions: [{ action: 'view-progress', title: 'View progress', url: 'statistics' }] } });
    }
    if (preferences.milestones) {
      const lifetimeQuestions = (await getResults()).reduce((sum, item) => sum + Number(item.totalQuestions ?? 0), 0);
      const milestone = Math.floor(lifetimeQuestions / 100) * 100;
      if (milestone >= 100) messages.push({ type: 'milestone', key: `questions-${milestone}`, payload: { title: `🏆 ${milestone} questions completed`, body: 'That is real momentum. Take a moment to see how far you’ve come.', tag: `milestone-${milestone}`, url: 'statistics', actions: [{ action: 'view-milestone', title: 'See achievement', url: 'statistics' }] } });
    }
    if (preferences.motivation && (preferences.motivationDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(clock.weekday) && isDue(clock.time, preferences.motivationTime ?? '08:00')) {
      try {
        const feed = await loadMotivationFeed();
        const { data: recent } = await admin.from('notification_inbox').select('metadata').eq('user_id', subscription.user_id).eq('notification_type', 'motivation').order('delivered_at', { ascending: false }).limit(12);
        const recentIds = (recent ?? []).map((item) => String(item.metadata?.quoteId ?? '')).filter(Boolean);
        const selected = chooseMotivation(feed, preferences.motivationTone ?? 'mixed', clock.time, recentIds);
        if (selected) {
          const image = preferences.motivationImages === false ? undefined : await resolveMotivationImage(feed, selected);
          messages.push({
            type: 'motivation',
            key: clock.date,
            payload: {
              title: selected.title,
              body: '',
              tag: `motivation-${clock.date}`,
              url: 'revision',
              image,
              imageAlt: image ? `Motivational image for ${selected.category}` : undefined,
              timestamp: Date.now(),
              actions: [{ action: 'start-revision', title: 'Start revision', url: 'revision' }],
            },
            inboxBody: selected.message,
            metadata: { quoteId: selected.id, category: selected.category, tone: selected.tone, author: selected.author ?? null, image: image ?? null },
          });
        }
      } catch (motivationError) {
        console.error('[motivation] Could not prepare scheduled reminder.', motivationError);
      }
    }
    if (!messages.length) continue;
    for (const message of messages) {
      let successful = false;
      const { data: existing } = await admin.from('notification_deliveries').select('id').eq('user_id', subscription.user_id).eq('notification_type', message.type).eq('dedupe_key', message.key).eq('subscription_id', subscription.id).maybeSingle();
      if (existing) {
        successful = true;
      } else {
        try {
          await deliver(subscription, message.payload);
          await admin.from('notification_deliveries').insert({ user_id: subscription.user_id, subscription_id: subscription.id, notification_type: message.type, dedupe_key: message.key });
          successful = true;
          delivered += 1;
        } catch (pushError) {
          const status = typeof pushError === 'object' && pushError && 'statusCode' in pushError ? Number(pushError.statusCode) : 0;
          if (status === 404 || status === 410) await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', subscription.id);
        }
      }
      if (successful) await admin.from('notification_inbox').upsert({ user_id: subscription.user_id, notification_type: message.type, dedupe_key: message.key, title: message.payload.title, body: message.inboxBody ?? message.payload.body, url: message.payload.url, metadata: message.metadata ?? {} }, { onConflict: 'user_id,notification_type,dedupe_key' });
    }
  }
  const { data: nudgePreferenceRows } = await admin.from('nudge_preferences').select('*').eq('enabled', true);
  for (const preferences of nudgePreferenceRows ?? []) {
    let clock: ReturnType<typeof localParts>;
    try { clock = localParts(preferences.timezone || 'UTC'); } catch { clock = localParts('UTC'); }
    if (!(preferences.delivery_days ?? []).includes(clock.weekday)) continue;
    if (inRange(clock.time, String(preferences.quiet_start).slice(0, 5), String(preferences.quiet_end).slice(0, 5))) continue;
    const windows = Array.isArray(preferences.windows) ? preferences.windows : [];
    if (!windows.some((window) => inRange(clock.time, window.start, window.end))) continue;
    const { data: recentDeliveries } = await admin.from('nudge_interactions').select('created_at,metadata').eq('user_id', preferences.user_id).eq('action', 'delivered').order('created_at', { ascending: false }).limit(20);
    const lastRealDelivery = recentDeliveries?.find((item) => item.metadata?.test !== true);
    const intervalMs = Math.max(60, Number(preferences.delivery_interval_minutes ?? 240)) * 60_000;
    if (lastRealDelivery && Date.now() - new Date(lastRealDelivery.created_at).getTime() < intervalMs) continue;
    const { count: deliveredToday } = await admin.from('nudge_interactions').select('id', { count: 'exact', head: true }).eq('user_id', preferences.user_id).eq('action', 'delivered').contains('metadata', { localDate: clock.date });
    if ((deliveredToday ?? 0) >= preferences.max_per_day) continue;
    const { data: candidates } = await admin.from('memory_nudges').select('*').eq('user_id', preferences.user_id).eq('active', true).eq('archived', false).or(`next_eligible_at.is.null,next_eligible_at.lte.${new Date().toISOString()}`);
    if (!candidates?.length) continue;
    let pool = candidates as Array<Record<string, unknown>>;
    if (preferences.avoid_repeats_until_cycle) {
      const minimumSends = Math.min(...pool.map((item) => Number(item.send_count ?? 0)));
      pool = pool.filter((item) => Number(item.send_count ?? 0) === minimumSends);
    }
    const selected = weightedPick(pool);
    if (!selected) continue;
    const { data: subscriptions } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key,preferences').eq('user_id', preferences.user_id).is('disabled_at', null);
    if (!subscriptions?.length) continue;
    const title = preferences.privacy_mode ? '🧠 A memory nudge is ready' : `🧠 ${String(selected.title)}`;
    const body = preferences.privacy_mode ? 'One important idea is ready for a quick private review.' : String(selected.content);
    let successful = false;
    for (const subscription of (subscriptions as SubscriptionRow[]).filter((item) => item.preferences?.enabled !== false && item.preferences?.memoryNudges !== false)) {
      try { await deliver(subscription, { title, body, tag: `nudge-${selected.id}`, url: `nudges?id=${selected.id}`, actions: [{ action: 'review-nudge', title: 'Review now', url: `nudges?id=${selected.id}` }] }); successful = true; delivered += 1; }
      catch (pushError) { const status = typeof pushError === 'object' && pushError && 'statusCode' in pushError ? Number(pushError.statusCode) : 0; if (status === 404 || status === 410) await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', subscription.id); }
    }
    if (successful) {
      const baseCooldown = Math.max(Number(selected.cooldown_hours ?? 24), Number(preferences.minimum_cooldown_hours ?? 24));
      const remembered = Number(selected.remembered_count ?? 0); const forgotten = Number(selected.forgotten_count ?? 0);
      const adaptiveFactor = preferences.adaptive_scheduling ? Math.max(.25, (1 + remembered * .5) / (1 + forgotten * .35)) : 1;
      await admin.from('memory_nudges').update({ last_sent_at: new Date().toISOString(), next_eligible_at: new Date(Date.now() + baseCooldown * adaptiveFactor * 3_600_000).toISOString(), send_count: Number(selected.send_count ?? 0) + 1 }).eq('id', selected.id);
      await admin.from('nudge_interactions').insert({ user_id: preferences.user_id, nudge_id: selected.id, action: 'delivered', metadata: { localDate: clock.date, timezone: preferences.timezone } });
      await admin.from('notification_inbox').insert({ user_id: preferences.user_id, notification_type: 'memory-nudge', dedupe_key: `${selected.id}-${new Date().toISOString()}`, title, body, url: `nudges?id=${selected.id}`, metadata: { nudgeId: selected.id, kind: selected.kind } });
    }
  }
  return Response.json({ delivered });
});
