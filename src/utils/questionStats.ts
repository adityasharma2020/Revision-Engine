import type { QuizResultList } from '../types';

export type QuestionOutcome = 'correct' | 'incorrect' | 'skipped';

export interface QuestionAttemptStats {
  attempts: number;
  correct: number;
  incorrect: number;
  skipped: number;
  lastOutcome: QuestionOutcome | null;
  lastAttemptAt: number | null;
}

export function questionAttemptStats(
  results: QuizResultList,
  chapterId: string,
): ReadonlyMap<string, QuestionAttemptStats> {
  const stats = new Map<string, QuestionAttemptStats>();
  const ordered = results
    .filter((result) => result.chapterId === chapterId && result.perQuestion?.length)
    .slice()
    .sort((a, b) => a.takenAt - b.takenAt);

  for (const result of ordered) {
    for (const question of result.perQuestion ?? []) {
      const current = stats.get(question.questionId) ?? {
        attempts: 0,
        correct: 0,
        incorrect: 0,
        skipped: 0,
        lastOutcome: null,
        lastAttemptAt: null,
      };
      const outcome: QuestionOutcome = question.correct === null
        ? 'skipped'
        : question.correct ? 'correct' : 'incorrect';
      stats.set(question.questionId, {
        ...current,
        attempts: current.attempts + 1,
        correct: current.correct + (outcome === 'correct' ? 1 : 0),
        incorrect: current.incorrect + (outcome === 'incorrect' ? 1 : 0),
        skipped: current.skipped + (outcome === 'skipped' ? 1 : 0),
        lastOutcome: outcome,
        lastAttemptAt: result.takenAt,
      });
    }
  }
  return stats;
}
