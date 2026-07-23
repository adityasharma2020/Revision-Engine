export type NudgeKind = 'fact' | 'data' | 'quote' | 'definition' | 'mistake' | 'reminder';
export type NudgeFeedback = 'remembered' | 'forgot' | 'snooze' | 'archive';

export interface MemoryNudge {
  id: string;
  kind: NudgeKind;
  title: string;
  content: string;
  context: string;
  source: string;
  sourceUrl: string;
  tags: string[];
  priority: number;
  cooldownHours: number;
  active: boolean;
  archived: boolean;
  nextEligibleAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  rememberedCount: number;
  forgottenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NudgeWindow { start: string; end: string }

export interface NudgePreferences {
  enabled: boolean;
  maxPerDay: number;
  deliveryIntervalMinutes: number;
  deliveryDays: number[];
  windows: NudgeWindow[];
  quietStart: string;
  quietEnd: string;
  privacyMode: boolean;
  adaptiveScheduling: boolean;
  minimumCooldownHours: number;
  defaultPriority: number;
  avoidRepeatsUntilCycle: boolean;
  timezone: string;
}

export const DEFAULT_NUDGE_PREFERENCES: NudgePreferences = {
  enabled: false,
  maxPerDay: 3,
  deliveryIntervalMinutes: 240,
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  windows: [{ start: '09:00', end: '20:00' }],
  quietStart: '22:00',
  quietEnd: '07:00',
  privacyMode: false,
  adaptiveScheduling: true,
  minimumCooldownHours: 72,
  defaultPriority: 3,
  avoidRepeatsUntilCycle: true,
  timezone: 'UTC',
};
