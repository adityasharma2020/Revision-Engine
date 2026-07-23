import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service credentials are unavailable.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function configureWebPush() {
  const subject = Deno.env.get('VAPID_SUBJECT');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!subject || !publicKey || !privateKey) throw new Error('VAPID secrets are not configured.');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return webpush;
}

export type PushPayload = { title: string; body: string; tag: string; url: string };
export type SubscriptionRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string };

export async function deliver(subscription: SubscriptionRow, payload: PushPayload) {
  const sender = configureWebPush();
  await sender.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
  }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
}
