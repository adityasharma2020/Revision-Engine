/**
 * Namespaced storage keys.
 *
 * Every persisted value lives under a single app namespace and a schema
 * version, so we can (a) never collide with other apps on the same origin and
 * (b) run migrations when the shape of stored data changes.
 */
export const STORAGE_NAMESPACE = 'ure';
export const STORAGE_SCHEMA_VERSION = 1;

export const StorageKeys = {
  progress: 'progress',
  questionAttemptLog: 'question-attempt-log',
  annotations: 'annotations',
  quizResults: 'quiz-results',
  userChapters: 'user-chapters',
  theme: 'theme',
  settings: 'settings',
  revisionPreferences: 'revision-preferences',
  practicePreferences: 'practice-preferences',
  quizSettings: 'quiz-settings',
  dailyRevisionAssignment: 'daily-revision-assignment',
  deviceNotificationSettings: '__device-notification-settings',
  activeFocusSession: '__active-focus-session',
  completedFocusSessions: 'completed-focus-sessions',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

/** Build the fully-qualified key written to the underlying backend. */
export function namespaced(key: string): string {
  return `${STORAGE_NAMESPACE}:v${STORAGE_SCHEMA_VERSION}:${key}`;
}
