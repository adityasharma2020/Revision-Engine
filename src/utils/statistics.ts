import type {
  AnnotationMap,
  ProgressMap,
  QuizResultList,
} from '../types';

export interface OverallStats {
  totalQuizzes: number;
  questionsAnswered: number;
  correct: number;
  accuracy: number; // 0–100
  timeStudiedMs: number;
  bookmarks: number;
  chaptersRevised: number;
}

export function computeOverall(
  results: QuizResultList,
  annotations: AnnotationMap,
  progress: ProgressMap,
): OverallStats {
  let questionsAnswered = 0;
  let correct = 0;
  let timeStudiedMs = 0;
  const chapters = new Set<string>();

  for (const r of results) {
    questionsAnswered += r.answered;
    correct += r.correct;
    timeStudiedMs += r.durationMs;
    chapters.add(r.chapterId);
  }
  Object.keys(progress).forEach((id) => chapters.add(id));

  const bookmarks = Object.values(annotations).filter((a) => a.bookmarked).length;

  return {
    totalQuizzes: results.length,
    questionsAnswered,
    correct,
    accuracy: questionsAnswered === 0 ? 0 : Math.round((correct / questionsAnswered) * 100),
    timeStudiedMs,
    bookmarks,
    chaptersRevised: chapters.size,
  };
}

export interface TrendPoint {
  label: string;
  accuracy: number; // 0–100
  correct: number;
  total: number;
  takenAt: number;
}

/** Accuracy per quiz, oldest → newest, capped to the most recent `limit`. */
export function accuracyTrend(results: QuizResultList, limit = 12): TrendPoint[] {
  return results
    .slice(0, limit)
    .reverse()
    .map((r, i) => ({
      label: `#${i + 1}`,
      accuracy: r.answered === 0 ? 0 : Math.round((r.correct / r.answered) * 100),
      correct: r.correct,
      total: r.answered,
      takenAt: r.takenAt,
    }));
}
