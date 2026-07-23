import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LocalStorageStore } from '../services/storage';
import {
  defaultDeviceNotificationSettings,
  normalizeDeviceNotificationSettings,
  type DeviceNotificationSettings,
} from '../services/notifications/DeviceNotificationSettings';
import { useAppSettings } from './AppSettingsContext';

const DEVICE_SETTINGS_KEY = '__device-notification-settings';

interface DeviceNotificationSettingsValue {
  settings: DeviceNotificationSettings;
  ready: boolean;
  update: (next: DeviceNotificationSettings | ((current: DeviceNotificationSettings) => DeviceNotificationSettings)) => void;
}

const DeviceNotificationSettingsContext = createContext<DeviceNotificationSettingsValue | null>(null);

/** Notification delivery choices are intentionally local to this browser installation. */
export function DeviceNotificationSettingsProvider({ children }: { children: ReactNode }) {
  const { settings: legacySettings, ready: legacyReady } = useAppSettings();
  const [settings, setSettings] = useState(defaultDeviceNotificationSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!legacyReady) return;
    let active = true;
    const store = new LocalStorageStore();
    void store.get<Partial<DeviceNotificationSettings>>(DEVICE_SETTINGS_KEY).then((stored) => {
      if (!active) return;
      const migrated = normalizeDeviceNotificationSettings(stored ?? {
        ...legacySettings.notifications,
        // Preserve an existing setup only on browsers where permission was
        // actually granted. A cloud toggle must never enable another device.
        enabled: legacySettings.notifications.enabled
          && 'Notification' in window
          && Notification.permission === 'granted',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || legacySettings.notifications.timezone || 'UTC',
      });
      setSettings(migrated);
      setReady(true);
      if (!stored) void store.set(DEVICE_SETTINGS_KEY, migrated);
    });
    return () => { active = false; };
  }, [legacyReady, legacySettings.notifications]);

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
