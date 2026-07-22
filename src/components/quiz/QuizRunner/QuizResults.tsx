import { useState } from 'react';
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
  includedInAnalytics?: boolean;
  onAnalyticsChange?: (included: boolean) => void;
  historical?: boolean;
  focusLossCount?: number;
}

type ReviewFilter = 'all' | 'incorrect' | 'skipped' | 'correct';

export function QuizResults({
  questions,
  answers,
  summary,
  onRetry,
  onExit,
  includedInAnalytics = true,
  onAnalyticsChange,
  historical = false,
  focusLossCount = 0,
}: QuizResultsProps) {
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [included, setIncluded] = useState(includedInAnalytics);
  const visibleQuestions = questions.filter((question) => {
    const selected = answers[question.id] ?? null;
    if (reviewFilter === 'skipped') return selected === null;
    if (reviewFilter === 'correct') return selected === question.answer;
    if (reviewFilter === 'incorrect') return selected !== null && selected !== question.answer;
    return true;
  });
  const stats = [
    { label: 'Correct', value: `${summary.correct}/${summary.total}` },
    { label: 'Accuracy', value: `${summary.accuracy}%` },
    { label: 'Skipped', value: String(summary.skipped) },
    { label: 'Time', value: humanizeDuration(summary.durationMs) },
    ...(focusLossCount > 0
      ? [{ label: 'Focus exits', value: String(focusLossCount) }]
      : []),
  ];

  return (
    <div className={styles.results}>
      <div className={styles.scoreCard}>
        <div className={styles.scoreRing} aria-hidden="true">
          <span className={styles.scoreValue}>{summary.accuracy}%</span>
          <span className={styles.scoreCaption}>accuracy</span>
        </div>
        <div className={styles.scoreMeta}>
          <h2 className={styles.scoreTitle}>{historical ? 'Saved quiz result' : 'Quiz complete'}</h2>
          <div className={styles.statGrid}>
            {stats.map((s) => (
              <div key={s.label} className={styles.stat}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.scoreActions}>
            {!historical && <Button variant="primary" onClick={onRetry}>Retry quiz</Button>}
            <Button variant="ghost" onClick={onExit}>
              {historical ? 'Back to history' : 'Back to learning'}
            </Button>
          </div>
          {onAnalyticsChange && (
            <button
              type="button"
              className={styles.analyticsToggle}
              role="switch"
              aria-checked={included}
              onClick={() => {
                const next = !included;
                setIncluded(next);
                onAnalyticsChange(next);
              }}
            >
              <span className={included ? styles.switchOn : styles.switchOff} aria-hidden="true"><span /></span>
              <span><strong>Include in analytics</strong><small>{included
                ? 'This attempt counts toward your dashboard and statistics.'
                : 'Saved in history, but excluded from dashboard calculations.'}</small></span>
            </button>
          )}
        </div>
      </div>

      <div className={styles.reviewHeader}>
        <h3 className={styles.reviewHeading}>Review responses</h3>
        <div className={styles.reviewFilters} aria-label="Filter reviewed responses">
          {(['all', 'incorrect', 'skipped', 'correct'] as const).map((filter) => {
            const count = questions.filter((question) => {
              const selected = answers[question.id] ?? null;
              if (filter === 'skipped') return selected === null;
              if (filter === 'correct') return selected === question.answer;
              if (filter === 'incorrect') return selected !== null && selected !== question.answer;
              return true;
            }).length;
            return (
              <button
                key={filter}
                type="button"
                className={reviewFilter === filter ? styles.reviewFilterActive : styles.reviewFilter}
                aria-pressed={reviewFilter === filter}
                onClick={() => setReviewFilter(filter)}
              >
                {filter[0].toUpperCase() + filter.slice(1)} <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.reviewList}>
        {visibleQuestions.map((q) => (
          <PrelimsCard
            key={q.id}
            question={q}
            index={questions.indexOf(q) + 1}
            mode="review"
            selectedOptionId={answers[q.id] ?? null}
          />
        ))}
        {visibleQuestions.length === 0 && (
          <p className={styles.reviewEmpty}>No responses match this filter.</p>
        )}
      </div>
    </div>
  );
}
