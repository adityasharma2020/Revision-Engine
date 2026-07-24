import type { AnnotationMap } from './annotations';
import type { Chapter } from './domain';
import type { ProgressMap, QuestionAttemptList } from './progress';
import type { QuizDefinition, QuizResultList } from './quiz';

export interface RevisionPreferences {
  readonly schemaVersion: number;
  readonly examName: string;
  readonly examDate: string | null;
  readonly dailyQuestionLimit: number;
  readonly newQuestionPercent: number;
  readonly includedChapterIds: readonly string[];
  readonly correctIntervals: readonly number[];
  readonly wrongReturnDays: number;
  readonly skippedReturnDays: number;
  readonly wrongLevelDrop: number;
  readonly skippedLevelDrop: number;
  readonly balanceSubjects: boolean;
  readonly prioritizeBookmarks: boolean;
  readonly sessionMode: 'standard' | 'strict';
  readonly fillDailyCapacity: boolean;
}

export const DEFAULT_REVISION_PREFERENCES: RevisionPreferences = {
  schemaVersion: 2,
  examName: '',
  examDate: '2027-05-23',
  dailyQuestionLimit: 10,
  newQuestionPercent: 20,
  includedChapterIds: [],
  correctIntervals: [1, 3, 7, 15, 30, 60, 120, 180],
  wrongReturnDays: 1,
  skippedReturnDays: 1,
  wrongLevelDrop: 2,
  skippedLevelDrop: 1,
  balanceSubjects: true,
  prioritizeBookmarks: true,
  sessionMode: 'standard',
  fillDailyCapacity: true,
};

/** A separate scheduler configuration for unlimited, user-started practice. */
export interface PracticePreferences {
  readonly schemaVersion: 2;
  readonly questionLimit: number;
  /** @deprecated Kept for migration from the first Practice release. */
  readonly selectionMode: 'adaptive' | 'review' | 'new';
  /** Null means use every available chapter until the user customises sources. */
  readonly includedChapterIds: readonly string[] | null;
  readonly newQuestionPercent: number;
  readonly correctIntervals: readonly number[];
  readonly wrongReturnDays: number;
  readonly skippedReturnDays: number;
  readonly wrongLevelDrop: number;
  readonly skippedLevelDrop: number;
  readonly balanceSubjects: boolean;
  readonly prioritizeBookmarks: boolean;
  readonly fillPracticeCapacity: boolean;
  readonly includeScheduled: boolean;
  readonly excludeTodaysDailyQuestions: boolean;
  readonly sessionMode: 'standard' | 'strict';
  readonly examDate: string | null;
}

export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  schemaVersion: 2,
  questionLimit: 10,
  selectionMode: 'adaptive',
  includedChapterIds: null,
  newQuestionPercent: 20,
  correctIntervals: [1, 3, 7, 15, 30, 60, 120, 180],
  wrongReturnDays: 1,
  skippedReturnDays: 1,
  wrongLevelDrop: 2,
  skippedLevelDrop: 1,
  balanceSubjects: true,
  prioritizeBookmarks: true,
  fillPracticeCapacity: true,
  includeScheduled: false,
  excludeTodaysDailyQuestions: true,
  sessionMode: 'standard',
  examDate: null,
};

export interface RevisionCandidate {
  readonly chapter: Chapter;
  readonly question: Chapter['prelims'][number];
}

export interface RevisionRecommendation extends RevisionCandidate {
  readonly score: number;
  readonly reason: string;
  readonly dueAt: number | null;
  readonly attempts: number;
  readonly accuracy: number | null;
  readonly level: number;
  readonly kind: 'due' | 'new' | 'scheduled';
  readonly nextIntervalDays: number | null;
}

export interface RevisionQuery {
  readonly limit: number;
  readonly newQuestionPercent: number;
  readonly includedChapterIds: readonly string[];
  readonly subjects?: readonly string[];
  readonly now?: number;
  readonly examDate?: string | null;
  readonly correctIntervals: readonly number[];
  readonly wrongReturnDays: number;
  readonly skippedReturnDays: number;
  readonly wrongLevelDrop: number;
  readonly skippedLevelDrop: number;
  readonly balanceSubjects: boolean;
  readonly prioritizeBookmarks: boolean;
  readonly fillDailyCapacity: boolean;
  /** Optional on-demand practice policy. Daily revision keeps the adaptive default. */
  readonly selectionMode?: 'adaptive' | 'review' | 'new';
  /** Practice may fill remaining capacity with not-yet-due questions. */
  readonly includeScheduled?: boolean;
}

export interface RevisionContext {
  readonly progress: ProgressMap;
  readonly quizResults: QuizResultList;
  readonly annotations: AnnotationMap;
  readonly questionAttemptLog: QuestionAttemptList;
}

export interface RevisionQueue {
  readonly recommendations: readonly RevisionRecommendation[];
  readonly requestedCount: number;
  readonly estimatedMinutes: number;
  readonly availableCount: number;
  readonly dueCount: number;
  readonly newCount: number;
  readonly scheduledCount: number;
  readonly totalDueCount: number;
  readonly enrolledChapterCount: number;
}

export interface DailyRevisionAssignment {
  readonly dateKey: string;
  readonly status: 'active' | 'completed';
  readonly definition: QuizDefinition;
  readonly generatedAt: number;
  readonly completedAt?: number;
  readonly resultId?: string;
  readonly score?: {
    readonly correct: number;
    readonly total: number;
    readonly answered: number;
    readonly skipped: number;
  };
  readonly attemptNumber: number;
}
