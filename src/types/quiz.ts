/**
 * Timed quiz sessions (Quiz mode).
 *
 * A quiz runs over a chapter's prelims questions with a stopwatch, no reveal
 * until the end, then produces a `QuizResult` — user data that persists through
 * StorageService and feeds the Statistics view.
 */

/** Which option the user chose for a question, or null if skipped/unanswered. */
export type QuizAnswerMap = Record<string, string | null>;

export interface QuizResult {
  readonly id: string;
  readonly chapterId: string;
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
}

export type QuizResultList = QuizResult[];
