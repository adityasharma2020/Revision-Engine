import type { QuestionAnnotation, QuestionType } from '../types';

/** Stable map key for a question's annotation. */
export function annotationKey(chapterId: string, questionId: string): string {
  return `${chapterId}:${questionId}`;
}

export function emptyAnnotation(
  chapterId: string,
  questionId: string,
  type: QuestionType,
): QuestionAnnotation {
  return {
    chapterId,
    questionId,
    type,
    bookmarked: false,
    note: '',
    tags: [],
    updatedAt: Date.now(),
  };
}

/** True when an annotation carries nothing worth persisting. */
export function isBlankAnnotation(a: QuestionAnnotation): boolean {
  return !a.bookmarked && a.note.trim() === '' && a.tags.length === 0;
}
