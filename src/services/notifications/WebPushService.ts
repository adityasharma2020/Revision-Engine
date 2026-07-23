import { env } from '../../config/env';
import { getSupabase } from '../supabase/client';
import type { DeviceNotificationSettings } from './DeviceNotificationSettings';

export type PushStatus = 'unsupported' | 'install-required' | 'unconfigured' | 'signed-out' | 'prompt' | 'granted' | 'denied';

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(padded);
  const output = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) output[index] = bytes.charCodeAt(index);
  return output;
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array<ArrayBuffer>) {
  if (!current || current.byteLength !== expected.byteLength) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((value, index) => value === expected[index]);
}

export function getPushStatus(authenticated: boolean): PushStatus {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (isIOS && !standalone) return 'install-required';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!env.pushConfigured || !env.supabaseConfigured) return 'unconfigured';
  if (!authenticated) return 'signed-out';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

async function registerCurrentDevice(userId: string, preferences: DeviceNotificationSettings): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('The notification service worker did not become ready. Install or refresh the app, then try again.')), 10_000)),
  ]);
  let existing = await registration.pushManager.getSubscription();
  const applicationServerKey = decodeVapidKey(env.vapidPublicKey);
  if (existing && !sameKey(existing.options.applicationServerKey, applicationServerKey)) {
    await existing.unsubscribe();
    existing = null;
  }
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Browser returned an incomplete push subscription.');
  const { error } = await client.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    user_agent: navigator.userAgent,
    preferences,
    disabled_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

/**
 * Reconciles this browser's subscription without displaying a permission
 * prompt. Push permission and subscriptions belong to a browser installation,
 * so a synced account preference alone cannot register another device.
 */
export async function syncWebPushSubscription(preferences: DeviceNotificationSettings): Promise<PushStatus> {
  const client = getSupabase();
  if (!client) return 'unconfigured';
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return 'signed-out';
  const status = getPushStatus(true);
  if (status !== 'granted') return status;
  await registerCurrentDevice(auth.user.id, preferences);
  return 'granted';
}

export async function enableWebPush(preferences: DeviceNotificationSettings): Promise<PushStatus> {
  const client = getSupabase();
  if (!client) return 'unconfigured';
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return 'signed-out';
  const status = getPushStatus(true);
  if (status === 'install-required' || status === 'unsupported' || status === 'unconfigured') return status;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'default' ? 'prompt' : permission;
  await registerCurrentDevice(auth.user.id, preferences);
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

export async function sendTestNotification(): Promise<number> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.functions.invoke<{ delivered?: number }>('test-notification');
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      try {
        const details = await response.clone().json() as { error?: string; code?: number; provider?: string };
        throw new Error([details.error, details.code ? `(HTTP ${details.code})` : '', details.provider].filter(Boolean).join(' '));
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason;
      }
    }
    throw error;
  }
  return Number(data?.delivered ?? 0);
}
