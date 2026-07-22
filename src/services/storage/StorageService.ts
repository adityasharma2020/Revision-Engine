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
} from '../../types';
import { DEFAULT_REVISION_PREFERENCES } from '../../types/revision';
import { StorageKeys } from './keys';
import type { KeyValueStore } from './types';

/** App-level preferences not tied to any single feature. */
export interface AppSettings {
  /** Reveal mains model answers automatically when opening a question. */
  autoRevealAnswers: boolean;
  /** Play subtle transition animations. */
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoRevealAnswers: false,
  reducedMotion: false,
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
    return { ...DEFAULT_SETTINGS, ...stored };
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
