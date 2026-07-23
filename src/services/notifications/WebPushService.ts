import { env } from '../../config/env';
import { getSupabase } from '../supabase/client';
import {
  getNotificationDeviceIdentity,
  normalizeDeviceNotificationSettings,
  type DeviceNotificationSettings,
} from './DeviceNotificationSettings';

export type PushStatus = 'unsupported' | 'install-required' | 'unconfigured' | 'signed-out' | 'prompt' | 'granted' | 'denied';

export interface NotificationSchedulerHealth {
  readonly lastStartedAt: string | null;
  readonly lastCompletedAt: string | null;
  readonly lastDeliveredCount: number;
}

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
  if (!client) throw new Error('Cloud notification services are unavailable.');
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
  const device = getNotificationDeviceIdentity();
  const row = {
    user_id: userId,
    device_key: device.key,
    device_name: device.name,
    platform: device.platform,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    user_agent: navigator.userAgent,
    preferences,
    disabled_at: null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Prefer the stable installation key. Falling back to endpoint upsert also
  // upgrades rows created before device identities were introduced.
  const { data: existingRow, error: lookupError } = await client
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('device_key', device.key)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const { error } = existingRow
    ? await client.from('push_subscriptions').update(row).eq('id', existingRow.id)
    : await client.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  if (error) throw error;
}

/** Loads only this installation's cloud settings; another device never wins. */
export async function loadCurrentDeviceNotificationSettings(
  userId: string,
): Promise<DeviceNotificationSettings | null> {
  const client = getSupabase();
  if (!client) return null;
  const device = getNotificationDeviceIdentity();
  const { data, error } = await client
    .from('push_subscriptions')
    .select('preferences')
    .eq('user_id', userId)
    .eq('device_key', device.key)
    .maybeSingle();
  if (error) throw error;
  return data?.preferences
    ? normalizeDeviceNotificationSettings(data.preferences as Partial<DeviceNotificationSettings>)
    : null;
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

export async function disableWebPush(preferences?: DeviceNotificationSettings): Promise<void> {
  const client = getSupabase();
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
  const subscription = await registration?.pushManager.getSubscription();
  if (client) {
    const device = getNotificationDeviceIdentity();
    const changes = {
      disabled_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      ...(preferences ? { preferences: { ...preferences, enabled: false } } : {}),
    };
    const query = client.from('push_subscriptions').update(changes);
    if (subscription) await query.eq('endpoint', subscription.endpoint);
    else await query.eq('device_key', device.key);
  }
  await subscription?.unsubscribe();
}

export async function sendTestNotification(
  kind: 'standard' | 'motivation' = 'standard',
  includeImage = true,
  motivationTone: DeviceNotificationSettings['motivationTone'] = 'mixed',
): Promise<number> {
  const client = getSupabase();
  if (!client) throw new Error('Cloud notification services are unavailable.');
  const { key: deviceKey } = getNotificationDeviceIdentity();
  const { data, error } = await client.functions.invoke<{ delivered?: number }>('test-notification', { body: { kind, deviceKey, includeImage, motivationTone } });
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

/** Proves the scheduled dispatcher is being invoked; test pushes do not. */
export async function getNotificationSchedulerHealth(): Promise<NotificationSchedulerHealth | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('notification_dispatch_health')
    .select('last_started_at,last_completed_at,last_delivered_count')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    lastStartedAt: data.last_started_at ? String(data.last_started_at) : null,
    lastCompletedAt: data.last_completed_at ? String(data.last_completed_at) : null,
    lastDeliveredCount: Number(data.last_delivered_count ?? 0),
  };
}
