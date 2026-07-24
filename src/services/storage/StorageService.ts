import type {
  AnnotationMap,
  Chapter,
  ProgressMap,
  QuestionAttemptList,
  QuizResult,
  QuizResultList,
  ThemeMode,
  RevisionPreferences,
  QuizSettings,
  DailyRevisionAssignment,
  PracticePreferences,
  ActiveFocusSession,
  CompletedFocusSessionList,
} from '../../types';
import { DEFAULT_REVISION_PREFERENCES } from '../../types/revision';
import { DEFAULT_PRACTICE_PREFERENCES } from '../../types/revision';
import { StorageKeys } from './keys';
import type { KeyValueStore } from './types';

/** App-level preferences not tied to any single feature. */
export interface AppSettings {
  readonly schemaVersion: 1;
  readonly dashboard: {
    /** Show the compact weekly activity overview on the home page. */
    readonly showActivityOverview: boolean;
  };
  readonly notifications: {
    /** @deprecated Kept only to seed the one-time per-device migration. */
    readonly enabled: boolean;
    readonly dailyRevision: boolean;
    readonly weeklySummary: boolean;
    readonly milestones: boolean;
    readonly dailyReminderTime: string;
    readonly weeklySummaryDay: number;
    readonly weeklySummaryTime: string;
    readonly timezone: string;
  };
  readonly accessibility: {
    readonly reduceMotion: boolean;
    /** Global text scale, expressed as a percentage from 90–130. */
    readonly fontScale: number;
  };
  readonly focusTimer: {
    readonly enabled: boolean;
    readonly defaultMinutes: number;
    readonly allowPause: boolean;
    readonly midpointNudge: boolean;
    readonly opacity: number;
    readonly size: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  dashboard: { showActivityOverview: true },
  notifications: {
    enabled: false,
    dailyRevision: true,
    weeklySummary: true,
    milestones: true,
    dailyReminderTime: '18:00',
    weeklySummaryDay: 0,
    weeklySummaryTime: '18:00',
    timezone: 'UTC',
  },
  accessibility: { reduceMotion: false, fontScale: 100 },
  focusTimer: { enabled: false, defaultMinutes: 30, allowPause: true, midpointNudge: true, opacity: 35, size: 20 },
};

/**
 * The domain-facing storage API the app actually uses.
 *
 * It speaks in terms of the domain (progress, bookmarks, theme, settings) and
 * delegates raw persistence to an injected `KeyValueStore`. Swapping the
 * backend (localStorage → Supabase) means passing a different store to the
 * constructor; every method signature here stays identical.
 */
export class StorageService {
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  // ---- Progress --------------------------------------------------------
  async loadProgress(): Promise<ProgressMap> {
    return (await this.store.get<ProgressMap>(StorageKeys.progress)) ?? {};
  }

  async saveProgress(progress: ProgressMap): Promise<void> {
    await this.store.set(StorageKeys.progress, progress);
  }

  async loadQuestionAttemptLog(): Promise<QuestionAttemptList> {
    return (await this.store.get<QuestionAttemptList>(StorageKeys.questionAttemptLog)) ?? [];
  }

  async saveQuestionAttemptLog(attempts: QuestionAttemptList): Promise<void> {
    await this.store.set(StorageKeys.questionAttemptLog, attempts);
  }

  // ---- Annotations (bookmarks, notes, user tags) -----------------------
  async loadAnnotations(): Promise<AnnotationMap> {
    return (await this.store.get<AnnotationMap>(StorageKeys.annotations)) ?? {};
  }

  async saveAnnotations(annotations: AnnotationMap): Promise<void> {
    await this.store.set(StorageKeys.annotations, annotations);
  }

  // ---- Quiz results ----------------------------------------------------
  async loadQuizResults(): Promise<QuizResultList> {
    return (await this.store.get<QuizResultList>(StorageKeys.quizResults)) ?? [];
  }

  async saveQuizResults(results: QuizResultList): Promise<void> {
    await this.store.set(StorageKeys.quizResults, results);
  }

  /** Append a single finished session, most-recent first. */
  async appendQuizResult(result: QuizResult): Promise<QuizResultList> {
    const results = await this.loadQuizResults();
    const next = [result, ...results];
    await this.saveQuizResults(next);
    return next;
  }

  // ---- Focus timer -----------------------------------------------------
  async loadActiveFocusSession(): Promise<ActiveFocusSession | null> {
    return this.store.get<ActiveFocusSession>(StorageKeys.activeFocusSession);
  }

  async saveActiveFocusSession(session: ActiveFocusSession | null): Promise<void> {
    if (session) await this.store.set(StorageKeys.activeFocusSession, session);
    else await this.store.remove(StorageKeys.activeFocusSession);
  }

  async loadCompletedFocusSessions(): Promise<CompletedFocusSessionList> {
    return (await this.store.get<CompletedFocusSessionList>(StorageKeys.completedFocusSessions)) ?? [];
  }

  async saveCompletedFocusSessions(sessions: CompletedFocusSessionList): Promise<void> {
    await this.store.set(StorageKeys.completedFocusSessions, sessions);
  }

  // ---- User-uploaded chapters ------------------------------------------
  async loadUserChapters(): Promise<Chapter[]> {
    return (await this.store.get<Chapter[]>(StorageKeys.userChapters)) ?? [];
  }

  async saveUserChapters(chapters: Chapter[]): Promise<void> {
    await this.store.set(StorageKeys.userChapters, chapters);
  }

  // ---- Theme -----------------------------------------------------------
  async loadTheme(): Promise<ThemeMode | null> {
    return this.store.get<ThemeMode>(StorageKeys.theme);
  }

  async saveTheme(theme: ThemeMode): Promise<void> {
    await this.store.set(StorageKeys.theme, theme);
  }

  // ---- Settings --------------------------------------------------------
  async loadSettings(): Promise<AppSettings> {
    const stored = await this.store.get<Partial<AppSettings>>(
      StorageKeys.settings,
    );
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      dashboard: { ...DEFAULT_SETTINGS.dashboard, ...stored?.dashboard },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...stored?.notifications },
      accessibility: {
        ...DEFAULT_SETTINGS.accessibility,
        ...stored?.accessibility,
        fontScale: Math.min(130, Math.max(90, stored?.accessibility?.fontScale ?? 100)),
      },
      focusTimer: {
        ...DEFAULT_SETTINGS.focusTimer,
        ...stored?.focusTimer,
        // The first timer release used a large 44px/92%-opacity presentation.
        // Migrate that shape once so existing users receive the intentionally
        // unobtrusive defaults; later user-selected values remain untouched.
        ...(!stored?.focusTimer || !('size' in stored.focusTimer)
          ? { opacity: DEFAULT_SETTINGS.focusTimer.opacity, size: DEFAULT_SETTINGS.focusTimer.size }
          : {}),
      },
      schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.store.set(StorageKeys.settings, settings);
  }

  async loadQuizSettings(defaults: QuizSettings): Promise<QuizSettings | null> {
    const stored = await this.store.get<Partial<QuizSettings>>(StorageKeys.quizSettings);
    return stored ? { ...defaults, ...stored } : null;
  }

  async saveQuizSettings(settings: QuizSettings): Promise<void> {
    await this.store.set(StorageKeys.quizSettings, settings);
  }

  async loadRevisionPreferences(): Promise<RevisionPreferences> {
    const stored = await this.store.get<Partial<RevisionPreferences>>(StorageKeys.revisionPreferences);
    if (!stored) return DEFAULT_REVISION_PREFERENCES;
    const migrated = {
      ...DEFAULT_REVISION_PREFERENCES,
      ...stored,
      // Migrate the former hard-coded label away; exam names are user-owned.
      examName: stored.examName === 'UPSC Prelims 2027' ? '' : (stored.examName ?? ''),
      examDate: stored.examDate ?? DEFAULT_REVISION_PREFERENCES.examDate,
      // v2 changes the former 20-question default to the more sustainable 10.
      dailyQuestionLimit: stored.schemaVersion ? (stored.dailyQuestionLimit ?? 10) : 10,
      schemaVersion: DEFAULT_REVISION_PREFERENCES.schemaVersion,
    };
    if (stored.schemaVersion !== DEFAULT_REVISION_PREFERENCES.schemaVersion) {
      await this.store.set(StorageKeys.revisionPreferences, migrated);
    }
    return migrated;
  }

  async saveRevisionPreferences(preferences: RevisionPreferences): Promise<void> {
    await this.store.set(StorageKeys.revisionPreferences, preferences);
  }

  async loadPracticePreferences(): Promise<PracticePreferences> {
    const stored = await this.store.get<Partial<PracticePreferences>>(StorageKeys.practicePreferences);
    const migrated: PracticePreferences = {
      ...DEFAULT_PRACTICE_PREFERENCES,
      ...stored,
      ...(stored?.schemaVersion !== DEFAULT_PRACTICE_PREFERENCES.schemaVersion
        ? { selectionMode: 'adaptive' as const, fillPracticeCapacity: true, includeScheduled: false }
        : {}),
      correctIntervals: stored?.correctIntervals?.length
        ? stored.correctIntervals
        : DEFAULT_PRACTICE_PREFERENCES.correctIntervals,
      includedChapterIds: stored && 'includedChapterIds' in stored
        ? stored.includedChapterIds ?? null
        : DEFAULT_PRACTICE_PREFERENCES.includedChapterIds,
      schemaVersion: DEFAULT_PRACTICE_PREFERENCES.schemaVersion,
    };
    if (stored && stored.schemaVersion !== DEFAULT_PRACTICE_PREFERENCES.schemaVersion) {
      await this.store.set(StorageKeys.practicePreferences, migrated);
    }
    return migrated;
  }

  async savePracticePreferences(preferences: PracticePreferences): Promise<void> {
    await this.store.set(StorageKeys.practicePreferences, preferences);
  }

  async loadDailyRevisionAssignment(): Promise<DailyRevisionAssignment | null> {
    return this.store.get<DailyRevisionAssignment>(StorageKeys.dailyRevisionAssignment);
  }

  async saveDailyRevisionAssignment(assignment: DailyRevisionAssignment): Promise<void> {
    await this.store.set(StorageKeys.dailyRevisionAssignment, assignment);
  }

  async clearDailyRevisionAssignment(): Promise<void> {
    await this.store.remove(StorageKeys.dailyRevisionAssignment);
  }

  // ---- Maintenance -----------------------------------------------------
  async resetAll(): Promise<void> {
    await this.store.clear();
  }
}
