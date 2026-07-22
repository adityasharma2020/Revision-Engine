import type {
  AnnotationMap,
  ProgressMap,
  QuizResult,
  QuizResultList,
  ThemeMode,
} from '../../types';
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

  // ---- Maintenance -----------------------------------------------------
  async resetAll(): Promise<void> {
    await this.store.clear();
  }
}
