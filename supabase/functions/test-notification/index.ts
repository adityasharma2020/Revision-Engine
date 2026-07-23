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
    await Promise.all((data as SubscriptionRow[]).map((subscription) => deliver(subscription, {
      title: 'Notifications are ready',
      body: 'This device can now receive your study reminders.',
      tag: 'notification-test',
      url: 'settings',
    })));
    return Response.json({ delivered: data.length }, { headers: corsHeaders });
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
