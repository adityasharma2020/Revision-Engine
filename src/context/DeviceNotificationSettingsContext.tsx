import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LocalStorageStore } from '../services/storage';
import {
  defaultDeviceNotificationSettings,
  loadCurrentDeviceNotificationSettings,
  normalizeDeviceNotificationSettings,
  type DeviceNotificationSettings,
} from '../services/notifications';
import { useAppSettings } from './AppSettingsContext';
import { useAuth } from './AuthContext';

const DEVICE_SETTINGS_KEY = '__device-notification-settings';

interface DeviceNotificationSettingsValue {
  settings: DeviceNotificationSettings;
  ready: boolean;
  update: (next: DeviceNotificationSettings | ((current: DeviceNotificationSettings) => DeviceNotificationSettings)) => void;
}

const DeviceNotificationSettingsContext = createContext<DeviceNotificationSettingsValue | null>(null);

/** Settings are keyed by installation locally and in Supabase. */
export function DeviceNotificationSettingsProvider({ children }: { children: ReactNode }) {
  const { settings: legacySettings, ready: legacyReady } = useAppSettings();
  const { status: authStatus, user } = useAuth();
  const [settings, setSettings] = useState(defaultDeviceNotificationSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!legacyReady || authStatus === 'loading') return;
    let active = true;
    const store = new LocalStorageStore();
    void (async () => {
      const stored = await store.get<Partial<DeviceNotificationSettings>>(DEVICE_SETTINGS_KEY);
      const migrated = normalizeDeviceNotificationSettings(stored ?? {
        ...legacySettings.notifications,
        // An account-level legacy toggle must never enable a new device.
        enabled: legacySettings.notifications.enabled
          && 'Notification' in window
          && Notification.permission === 'granted',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || legacySettings.notifications.timezone || 'UTC',
      });
      let resolved = migrated;
      if (authStatus === 'authenticated' && user) {
        try {
          resolved = await loadCurrentDeviceNotificationSettings(user.id) ?? migrated;
        } catch (error) {
          console.warn('[push] Could not load this device settings from Supabase.', error);
        }
      }
      if (!active) return;
      setSettings(resolved);
      setReady(true);
      await store.set(DEVICE_SETTINGS_KEY, resolved);
    })();
    return () => { active = false; };
  }, [authStatus, legacyReady, legacySettings.notifications, user]);

  const update = useCallback((next: DeviceNotificationSettings | ((current: DeviceNotificationSettings) => DeviceNotificationSettings)) => {
    if (typeof next !== 'function') {
      void new LocalStorageStore().set(DEVICE_SETTINGS_KEY, next);
      setSettings(next);
      return;
    }
    setSettings((current) => {
      const value = next(current);
      void new LocalStorageStore().set(DEVICE_SETTINGS_KEY, value);
      return value;
    });
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [ready, settings, update]);
  return <DeviceNotificationSettingsContext.Provider value={value}>{children}</DeviceNotificationSettingsContext.Provider>;
}

export function useDeviceNotificationSettings(): DeviceNotificationSettingsValue {
  const value = useContext(DeviceNotificationSettingsContext);
  if (!value) throw new Error('useDeviceNotificationSettings must be used within DeviceNotificationSettingsProvider');
  return value;
}
