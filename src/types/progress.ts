/**
 * User-generated state: revision progress, bookmarks, notes.
 *
 * This is the data that must survive across sessions and, eventually, sync to
 * the cloud. It is deliberately serialisable (plain JSON) so any StorageService
 * backend — localStorage today, Supabase tomorrow — can persist it unchanged.
 */

import type { Difficulty, QuestionType } from './domain';

/** One recorded interaction with a single question. */
export interface QuestionAttempt {
  readonly chapterId: string;
  readonly questionId: string;
  /** Content snapshot retained for historical analytics. */
  readonly questionText?: string;
  readonly questionTags?: readonly string[];
  readonly type: QuestionType;
  /** Option id the user selected (prelims only). */
  readonly selectedOption?: string;
  /** Whether the attempt was correct (prelims only). */
  readonly correct?: boolean;
  /** Self-graded confidence for mains / spaced-repetition. */
  readonly confidence?: Confidence;
  /** Question difficulty snapshot, for accuracy-by-difficulty analytics. */
  readonly difficulty?: Difficulty;
  /** Question provenance snapshot (FYQ/PYQ/etc.) for historical analytics. */
  readonly origin?: string;
  /** Time spent on the question before answering, in milliseconds. */
  readonly timeMs?: number;
  /** Epoch milliseconds. */
  readonly attemptedAt: number;
}

/** Append-only interaction history used for durable question-level analytics. */
export type QuestionAttemptList = QuestionAttempt[];

export type Confidence = 'again' | 'hard' | 'good' | 'easy';

/** Aggregated progress for a single chapter, keyed by question id. */
export interface ChapterProgress {
  readonly chapterId: string;
  readonly attempts: Record<string, QuestionAttempt>;
  readonly lastVisitedAt: number;
}

/** All revision progress across every chapter. */
export type ProgressMap = Record<string, ChapterProgress>;

/** A bookmarked question the user wants to revisit. */
export interface Bookmark {
  readonly chapterId: string;
  readonly questionId: string;
  readonly type: QuestionType;
  readonly createdAt: number;
  readonly note?: string;
}

export type BookmarkKey = string; // `${chapterId}:${questionId}`
export type BookmarkMap = Record<BookmarkKey, Bookmark>;
