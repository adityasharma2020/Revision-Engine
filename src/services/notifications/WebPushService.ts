import { env } from '../../config/env';
import { getSupabase } from '../supabase/client';

export type PushStatus = 'unsupported' | 'unconfigured' | 'signed-out' | 'prompt' | 'granted' | 'denied';

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(padded);
  const output = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) output[index] = bytes.charCodeAt(index);
  return output;
}

export function getPushStatus(authenticated: boolean): PushStatus {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!env.pushConfigured || !env.supabaseConfigured) return 'unconfigured';
  if (!authenticated) return 'signed-out';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function enableWebPush(): Promise<PushStatus> {
  const client = getSupabase();
  if (!client) return 'unconfigured';
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return 'signed-out';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'default' ? 'prompt' : permission;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(env.vapidPublicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Browser returned an incomplete push subscription.');
  const { error } = await client.from('push_subscriptions').upsert({
    user_id: auth.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    user_agent: navigator.userAgent,
    disabled_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  return 'granted';
}

export async function disableWebPush(): Promise<void> {
  const client = getSupabase();
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
  const subscription = await registration?.pushManager.getSubscription();
  if (client && subscription) {
    await client.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('endpoint', subscription.endpoint);
  }
  await subscription?.unsubscribe();
}

export async function sendTestNotification(): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.functions.invoke('test-notification');
  if (error) throw error;
}
