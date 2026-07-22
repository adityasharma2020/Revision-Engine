export type QuizPerformanceTone = 'excellent' | 'good' | 'developing' | 'review';

export interface QuizPerformance {
  accuracy: number;
  emoji: string;
  label: string;
  message: string;
  tone: QuizPerformanceTone;
}

export function getQuizPerformance(correct: number, total: number): QuizPerformance {
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  if (accuracy >= 80) {
    return { accuracy, emoji: '🏆', label: 'Excellent recall', message: 'Strong work—keep this momentum going.', tone: 'excellent' };
  }
  if (accuracy >= 60) {
    return { accuracy, emoji: '✨', label: 'Good progress', message: 'A quick review can make this even stronger.', tone: 'good' };
  }
  if (accuracy >= 40) {
    return { accuracy, emoji: '🧭', label: 'Recall is developing', message: 'Review the missed explanations before your next attempt.', tone: 'developing' };
  }
  return { accuracy, emoji: '🌱', label: 'Review and retry', message: 'Revisit the explanations—this is where improvement begins.', tone: 'review' };
}
