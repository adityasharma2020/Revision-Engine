/**
 * Timed quiz sessions (Quiz mode).
 *
 * A quiz runs over a chapter's prelims questions with a stopwatch, no reveal
 * until the end, then produces a `QuizResult` — user data that persists through
 * StorageService and feeds the Statistics view.
 */

import type { Difficulty } from './domain';

/** Which option the user chose for a question, or null if skipped/unanswered. */
export type QuizAnswerMap = Record<string, string | null>;

/** Per-question outcome + timing within a quiz session — the granular record. */
export interface QuizQuestionResult {
  readonly questionId: string;
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
  readonly chapterId: string;
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
  /** Granular per-question timing + outcome (added for deep analytics). */
  readonly perQuestion?: readonly QuizQuestionResult[];
}

export type QuizResultList = QuizResult[];
