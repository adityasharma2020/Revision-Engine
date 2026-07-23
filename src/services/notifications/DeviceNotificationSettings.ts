export interface DeviceNotificationSettings {
  readonly enabled: boolean;
  readonly dailyRevision: boolean;
  readonly weeklySummary: boolean;
  readonly milestones: boolean;
  readonly memoryNudges: boolean;
  readonly motivation: boolean;
  readonly motivationTimes: readonly string[];
  readonly motivationDays: readonly number[];
  readonly motivationTone: 'mixed' | 'soft' | 'balanced' | 'firm' | 'brutal';
  readonly motivationImages: boolean;
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
    motivation: false,
    motivationTimes: ['05:30', '19:00', '22:00'],
    motivationDays: [0, 1, 2, 3, 4, 5, 6],
    motivationTone: 'mixed',
    motivationImages: true,
    dailyReminderTime: '18:00',
    weeklySummaryDay: 0,
    weeklySummaryTime: '18:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

export function normalizeDeviceNotificationSettings(
  value?: Partial<DeviceNotificationSettings> | null,
): DeviceNotificationSettings {
  const defaults = defaultDeviceNotificationSettings();
  const legacyValue = value as (Partial<DeviceNotificationSettings> & { motivationTime?: unknown }) | null | undefined;
  const tone = value?.motivationTone;
  const days = Array.isArray(value?.motivationDays)
    ? [...new Set(value.motivationDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : defaults.motivationDays;
  const configuredTimes = Array.isArray(value?.motivationTimes)
    ? value.motivationTimes
    : typeof legacyValue?.motivationTime === 'string'
      ? [legacyValue.motivationTime, '19:00', '22:00']
      : defaults.motivationTimes;
  const motivationTimes = [...new Set(configuredTimes.filter((time): time is string => (
    typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )))].slice(0, 5);
  const cleanValue = value ? { ...value } as Record<string, unknown> : {};
  delete cleanValue.motivationTime;
  return {
    ...defaults,
    ...cleanValue,
    motivationTimes: motivationTimes.length ? motivationTimes : defaults.motivationTimes,
    motivationDays: days.length ? days : defaults.motivationDays,
    motivationTone: tone && ['mixed', 'soft', 'balanced', 'firm', 'brutal'].includes(tone) ? tone : defaults.motivationTone,
  };
}
