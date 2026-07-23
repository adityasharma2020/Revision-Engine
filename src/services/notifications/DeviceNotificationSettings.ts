export interface DeviceNotificationSettings {
  readonly enabled: boolean;
  readonly dailyRevision: boolean;
  readonly weeklySummary: boolean;
  readonly milestones: boolean;
  readonly memoryNudges: boolean;
  readonly dailyReminderTime: string;
  readonly weeklySummaryDay: number;
  readonly weeklySummaryTime: string;
  readonly timezone: string;
}

export interface NotificationDeviceIdentity {
  readonly key: string;
  readonly name: string;
  readonly platform: string;
}

const DEVICE_KEY_STORAGE = 'revision-engine:notification-device-key';

function browserName(): string {
  const agent = navigator.userAgent;
  if (/Edg\//.test(agent)) return 'Edge';
  if (/CriOS|Chrome\//.test(agent)) return 'Chrome';
  if (/Firefox\//.test(agent)) return 'Firefox';
  if (/Safari\//.test(agent)) return 'Safari';
  return 'Browser';
}

function deviceDescription(): { name: string; platform: string } {
  const agent = navigator.userAgent;
  const platform = /iPad/.test(agent)
    ? 'iPadOS'
    : /iPhone|iPod/.test(agent)
      ? 'iOS'
      : /Android/.test(agent)
        ? 'Android'
        : /Mac/.test(agent)
          ? 'macOS'
          : /Windows/.test(agent)
            ? 'Windows'
            : /Linux/.test(agent)
              ? 'Linux'
              : 'Unknown';
  const form = /iPad|Tablet|Android(?!.*Mobile)/i.test(agent)
    ? 'tablet'
    : /iPhone|iPod|Android.*Mobile/i.test(agent)
      ? 'phone'
      : 'computer';
  return { name: `${platform} ${form} · ${browserName()}`, platform };
}

/** Stable for this browser/PWA installation, but never shared across devices. */
export function getNotificationDeviceIdentity(): NotificationDeviceIdentity {
  let key = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY_STORAGE, key);
  }
  return { key, ...deviceDescription() };
}

export function defaultDeviceNotificationSettings(): DeviceNotificationSettings {
  return {
    enabled: false,
    dailyRevision: true,
    weeklySummary: true,
    milestones: true,
    memoryNudges: true,
    dailyReminderTime: '18:00',
    weeklySummaryDay: 0,
    weeklySummaryTime: '18:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

export function normalizeDeviceNotificationSettings(
  value?: Partial<DeviceNotificationSettings> | null,
): DeviceNotificationSettings {
  return { ...defaultDeviceNotificationSettings(), ...value };
}
