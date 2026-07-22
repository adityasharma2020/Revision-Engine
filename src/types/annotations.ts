/**
 * Per-question user annotations — the personal overlay on top of the static
 * chapter JSON. Bookmarks, notes and user-added tags all live here so the
 * canonical content stays immutable while the user has full freedom to mark it
 * up. Maps cleanly to a single Supabase table later.
 *
 * Helpers (`annotationKey`, `emptyAnnotation`, …) live in utils/annotations.ts.
 */
import type { QuestionType } from './domain';

export interface QuestionAnnotation {
  readonly chapterId: string;
  readonly questionId: string;
  readonly type: QuestionType;
  readonly bookmarked: boolean;
  /** Free-text personal note ('' when none). */
  readonly note: string;
  /** User-added tags, merged with the question's own tags at render time. */
  readonly tags: readonly string[];
  readonly updatedAt: number;
}

/** Keyed by `${chapterId}:${questionId}`. */
export type AnnotationMap = Record<string, QuestionAnnotation>;
