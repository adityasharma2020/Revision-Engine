import { adminClient, corsHeaders, deliver, type SubscriptionRow } from '../_shared/push.ts';
import { chooseMotivation, loadMotivationFeed, resolveMotivationImage, type MotivationTone } from '../_shared/motivation.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: 'Invalid session.' }, { status: 401, headers: corsHeaders });
    const input = await request.json().catch(() => ({})) as { kind?: string; deviceKey?: string; includeImage?: boolean; motivationTone?: MotivationTone | 'mixed' };
    let query = admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key,preferences').eq('user_id', auth.user.id).is('disabled_at', null);
    if (input.deviceKey) query = query.eq('device_key', input.deviceKey);
    const { data, error } = await query;
    if (error) throw error;
    const enabledDevices = (data as SubscriptionRow[] | null)?.filter((device) => device.preferences?.enabled !== false) ?? [];
    if (!enabledDevices.length) return Response.json({ error: 'No device currently allows notifications.' }, { status: 409, headers: corsHeaders });
    let delivered = 0;
    let expired = 0;
    let lastDeliveryError: unknown = null;
    let motivationPayload: Awaited<ReturnType<typeof buildMotivationPreview>> | null = null;
    if (input.kind === 'motivation') motivationPayload = await buildMotivationPreview(input.includeImage !== false, input.motivationTone ?? 'mixed');
    for (const subscription of enabledDevices) {
      try {
        await deliver(subscription, motivationPayload ?? {
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
    return Response.json({ delivered, expired, failed: enabledDevices.length - delivered - expired }, { headers: corsHeaders });
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

async function buildMotivationPreview(includeImage: boolean, tone: MotivationTone | 'mixed') {
  const feed = await loadMotivationFeed();
  const selected = chooseMotivation(feed, tone, new Date().toISOString().slice(11, 16));
  if (!selected) throw new Error('No motivational messages are available.');
  const image = includeImage ? await resolveMotivationImage(feed, selected) : undefined;
  return {
    title: selected.title,
    body: '',
    tag: `motivation-preview-${Date.now()}`,
    url: 'revision',
    image,
    imageAlt: image ? `Motivational image for ${selected.category}` : undefined,
    timestamp: Date.now(),
    actions: [{ action: 'start-revision', title: 'Start revision', url: 'revision' }],
  };
}
