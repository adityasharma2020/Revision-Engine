import type { PrelimsQuestion, QuizAnswerMap } from '../../../types';
import type { QuizSummary } from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { humanizeDuration } from '../../../utils/time';
import { PrelimsCard } from '../PrelimsCard';
import styles from './QuizRunner.module.css';

interface QuizResultsProps {
  questions: readonly PrelimsQuestion[];
  answers: QuizAnswerMap;
  summary: QuizSummary;
  onRetry: () => void;
  onExit: () => void;
}

export function QuizResults({
  questions,
  answers,
  summary,
  onRetry,
  onExit,
}: QuizResultsProps) {
  const stats = [
    { label: 'Correct', value: `${summary.correct}/${summary.total}` },
    { label: 'Accuracy', value: `${summary.accuracy}%` },
    { label: 'Skipped', value: String(summary.skipped) },
    { label: 'Time', value: humanizeDuration(summary.durationMs) },
  ];

  return (
    <div className={styles.results}>
      <div className={styles.scoreCard}>
        <div className={styles.scoreRing} aria-hidden="true">
          <span className={styles.scoreValue}>{summary.accuracy}%</span>
          <span className={styles.scoreCaption}>accuracy</span>
        </div>
        <div className={styles.scoreMeta}>
          <h2 className={styles.scoreTitle}>Quiz complete</h2>
          <div className={styles.statGrid}>
            {stats.map((s) => (
              <div key={s.label} className={styles.stat}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.scoreActions}>
            <Button variant="primary" onClick={onRetry}>
              Retry quiz
            </Button>
            <Button variant="ghost" onClick={onExit}>
              Back to learning
            </Button>
          </div>
        </div>
      </div>

      <h3 className={styles.reviewHeading}>Review</h3>
      <div className={styles.reviewList}>
        {questions.map((q, i) => (
          <PrelimsCard
            key={q.id}
            question={q}
            index={i + 1}
            mode="review"
            selectedOptionId={answers[q.id] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
