import { adminClient, corsHeaders, deliver, type SubscriptionRow } from '../_shared/push.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: 'Invalid session.' }, { status: 401, headers: corsHeaders });
    const { data, error } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key').eq('user_id', auth.user.id).is('disabled_at', null);
    if (error) throw error;
    if (!data?.length) return Response.json({ error: 'No active device subscription.' }, { status: 409, headers: corsHeaders });
    let delivered = 0;
    let expired = 0;
    let lastDeliveryError: unknown = null;
    for (const subscription of data as SubscriptionRow[]) {
      try {
        await deliver(subscription, {
          title: '✨ You’re all set',
          body: 'Smart revision reminders and memory nudges will arrive here at the times you choose.',
          tag: 'notification-test',
          url: 'settings',
          actions: [{ action: 'open-settings', title: 'Review preferences', url: 'settings' }],
        });
        delivered += 1;
      } catch (pushError) {
        const status = typeof pushError === 'object' && pushError && 'statusCode' in pushError ? Number(pushError.statusCode) : 0;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', subscription.id);
          expired += 1;
        } else {
          lastDeliveryError = pushError;
        }
      }
    }
    if (!delivered && lastDeliveryError) throw lastDeliveryError;
    if (!delivered) return Response.json({ error: 'Your saved device subscriptions have expired. Re-enable notifications and try again.' }, { status: 410, headers: corsHeaders });
    return Response.json({ delivered, expired, failed: data.length - delivered - expired }, { headers: corsHeaders });
  } catch (error) {
    const details = error && typeof error === 'object' ? {
      name: 'name' in error ? String(error.name) : 'PushDeliveryError',
      message: 'message' in error ? String(error.message) : 'Delivery failed.',
      statusCode: 'statusCode' in error ? Number(error.statusCode) : undefined,
      body: 'body' in error ? String(error.body).slice(0, 500) : undefined,
    } : { name: 'PushDeliveryError', message: String(error) };
    console.error('[test-notification] delivery failed', details);
    return Response.json({ error: details.message, code: details.statusCode, provider: details.body }, { status: 500, headers: corsHeaders });
  }
});
