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
