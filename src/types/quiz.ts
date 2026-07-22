/**
 * Timed quiz sessions (Quiz mode).
 *
 * A quiz runs over a generated question set with a stopwatch, no reveal
 * until the end, then produces a `QuizResult` — user data that persists through
 * StorageService and feeds the Statistics view.
 */

import type { Chapter, Difficulty, PrelimsQuestion } from './domain';

export interface QuizSettings {
  allowPause: boolean;
  lockNavigation: boolean;
  trackFocusLoss: boolean;
  allowQuit: boolean;
  focusPenaltyEnabled: boolean;
  focusLossGrace: number;
  focusPenaltyPerLoss: number;
  timeLimitEnabled: boolean;
  secondsPerQuestion: number;
  autoSubmitOnTimeEnd: boolean;
}

/** Which option the user chose for a question, or null if skipped/unanswered. */
export type QuizAnswerMap = Record<string, string | null>;

export type QuizQuestionSetType =
  | 'full'
  | 'correct-last'
  | 'missed-last'
  | 'incorrect-last'
  | 'skipped-last'
  | 'needs-review'
  | 'custom';

/** Snapshot of how a quiz's question set was assembled. */
export interface QuizQuestionSet {
  readonly type: QuizQuestionSetType;
  readonly label: string;
  readonly questionIds: readonly string[];
  /** Eligible questions before a targeted/custom subset was applied. */
  readonly sourceQuestionCount: number;
}

/** Per-question outcome + timing within a quiz session — the granular record. */
export interface QuizQuestionResult {
  readonly questionId: string;
  /** Original content chapter, retained when a quiz mixes several chapters. */
  readonly chapterId?: string;
  /** Question text snapshot for durable, cross-device analytics. */
  readonly questionStatement?: string;
  readonly tags?: readonly string[];
  readonly selectedOption: string | null;
  /** true/false when answered, null when skipped. */
  readonly correct: boolean | null;
  /** Time the user spent on this question, in milliseconds. */
  readonly timeMs: number;
  readonly difficulty?: Difficulty;
  /** Question provenance snapshot (FYQ/PYQ/etc.) for historical analytics. */
  readonly origin?: string;
}

export interface QuizResult {
  readonly id: string;
  /** Independent session id. It is never a chapter id. */
  readonly quizId?: string;
  readonly chapterId: string;
  /** Chapter title snapshot for readable history even if content later changes. */
  readonly chapterTitle?: string;
  /** Subject snapshot, so analytics don't need the chapter loaded. */
  readonly subject?: string;
  readonly totalQuestions: number;
  readonly answered: number;
  readonly correct: number;
  readonly skipped: number;
  /** Elapsed time of the session in milliseconds. */
  readonly durationMs: number;
  /** Epoch milliseconds the quiz finished. */
  readonly takenAt: number;
  /** Full answer map, retained so the session can be reviewed later. */
  readonly answers: QuizAnswerMap;
  /** Durable question snapshot for generated and cross-chapter quizzes. */
  readonly questions?: readonly PrelimsQuestion[];
  /** Granular per-question timing + outcome (added for deep analytics). */
  readonly perQuestion?: readonly QuizQuestionResult[];
  /** Selection snapshot retained for history, sharing, and analytics. */
  readonly questionSet?: QuizQuestionSet;
  /** False keeps the attempt in history/review but excludes it from analytics. */
  readonly includedInAnalytics?: boolean;
  /** Session policy snapshot for attempt history. */
  readonly settings?: {
    readonly allowPause: boolean;
    readonly lockNavigation: boolean;
    readonly trackFocusLoss: boolean;
    readonly allowQuit: boolean;
    readonly focusPenaltyEnabled: boolean;
    readonly focusLossGrace: number;
    readonly focusPenaltyPerLoss: number;
    readonly timeLimitEnabled: boolean;
    readonly secondsPerQuestion: number;
    readonly autoSubmitOnTimeEnd: boolean;
  };
  /** Number of detected tab/app focus interruptions during the attempt. */
  readonly focusLossCount?: number;
  readonly focusInterruptions?: readonly number[];
  readonly focusPenaltyTotal?: number;
  readonly adjustedScore?: number;
  readonly timedOut?: boolean;
  readonly purpose?: 'daily-revision';
  readonly dailyDateKey?: string;
  /** Synced tombstone. Deleted results remain recoverable in storage history. */
  readonly isDeleted?: 1;
  readonly deletedAt?: number;
}

export type QuizResultList = QuizResult[];

/** Persisted launch contract for an independent quiz session. */
export interface QuizDefinition {
  readonly id: string;
  readonly chapter: Chapter;
  readonly questions: readonly PrelimsQuestion[];
  readonly settings: QuizSettings;
  readonly questionSet: QuizQuestionSet;
  readonly questionChapterIds?: Readonly<Record<string, string>>;
  readonly questionRevisionMeta?: Readonly<Record<string, { attempts: number; accuracy: number | null; level: number; reason: string }>>;
  readonly createdAt: number;
  readonly purpose?: 'daily-revision';
  readonly dailyDateKey?: string;
  readonly studyQuote?: {
    readonly quote: string;
    readonly author: string;
    readonly topics: readonly string[];
  };
}
