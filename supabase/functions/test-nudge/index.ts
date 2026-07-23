import { adminClient, corsHeaders, deliver, type SubscriptionRow } from '../_shared/push.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: 'Invalid session.' }, { status: 401, headers: corsHeaders });
    const input = await request.json().catch(() => ({})) as { nudgeId?: string };
    if (!input.nudgeId) return Response.json({ error: 'Choose a nudge to send.' }, { status: 400, headers: corsHeaders });
    const { data: nudge, error: nudgeError } = await admin.from('memory_nudges').select('*').eq('id', input.nudgeId).eq('user_id', auth.user.id).eq('archived', false).maybeSingle();
    if (nudgeError) throw nudgeError;
    if (!nudge) return Response.json({ error: 'That nudge was not found.' }, { status: 404, headers: corsHeaders });
    const { data: preferences } = await admin.from('nudge_preferences').select('privacy_mode').eq('user_id', auth.user.id).maybeSingle();
    const { data: subscriptions, error: subscriptionError } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key,preferences').eq('user_id', auth.user.id).is('disabled_at', null);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) return Response.json({ error: 'No active notification device. Enable notifications on this device first.' }, { status: 409, headers: corsHeaders });
    const privateMode = Boolean(preferences?.privacy_mode);
    const title = privateMode ? '🧠 A memory nudge is ready' : `🧠 ${String(nudge.title)}`;
    const body = privateMode ? 'One important idea is ready for a quick private review.' : String(nudge.content);
    const eligibleSubscriptions = (subscriptions as SubscriptionRow[]).filter((item) => item.preferences?.enabled !== false && item.preferences?.memoryNudges !== false);
    if (!eligibleSubscriptions.length) return Response.json({ error: 'Memory nudges are paused on every active device.' }, { status: 409, headers: corsHeaders });
    let delivered = 0;
    for (const subscription of eligibleSubscriptions) {
      try {
        await deliver(subscription, { title, body, tag: `nudge-test-${nudge.id}`, url: `nudges?id=${nudge.id}`, actions: [{ action: 'review-nudge', title: 'Review now', url: `nudges?id=${nudge.id}` }] });
        delivered += 1;
      } catch (pushError) {
        const status = typeof pushError === 'object' && pushError && 'statusCode' in pushError ? Number(pushError.statusCode) : 0;
        if (status === 404 || status === 410) await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', subscription.id);
        else throw pushError;
      }
    }
    if (!delivered) return Response.json({ error: 'Your saved device subscriptions have expired. Re-enable notifications and try again.' }, { status: 410, headers: corsHeaders });
    await admin.from('nudge_interactions').insert({ user_id: auth.user.id, nudge_id: nudge.id, action: 'delivered', metadata: { test: true } });
    await admin.from('notification_inbox').insert({ user_id: auth.user.id, notification_type: 'memory-nudge-test', dedupe_key: `${nudge.id}-${new Date().toISOString()}`, title: `Test · ${title}`, body, url: `nudges?id=${nudge.id}`, metadata: { test: true, nudgeId: nudge.id } });
    return Response.json({ delivered, nudgeId: nudge.id }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[test-nudge] delivery failed', { message });
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});
