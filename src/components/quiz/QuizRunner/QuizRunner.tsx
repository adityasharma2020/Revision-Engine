import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chapter } from '../../../types';
import { useUserData } from '../../../context/UserDataContext';
import { EmptyState } from '../../common/EmptyState';
import { QuizIntro } from './QuizIntro';
import { QuizSession } from './QuizSession';
import {
  findActiveQuizDraft,
  hasQuizDraft,
  STANDARD_QUIZ_SETTINGS,
  type QuizSettings,
} from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { Routes } from '../../../constants/routes';
import { humanizeDuration } from '../../../utils/time';
import type { QuizResult } from '../../../types';
import { QuizResults } from './QuizResults';
import styles from './QuizRunner.module.css';

interface QuizRunnerProps {
  chapter: Chapter;
  questions?: Chapter['prelims'];
  onActiveChange?: (active: boolean) => void;
  onRequestLearning?: () => void;
}

/** Entry point for Quiz mode: intro gate → a keyed, restartable session. */
export function QuizRunner({
  chapter,
  questions = chapter.prelims,
  onActiveChange,
  onRequestLearning,
}: QuizRunnerProps) {
  const { quizResults, setQuizResultAnalytics } = useUserData();
  const navigate = useNavigate();
  const activeDraft = findActiveQuizDraft();
  const [phase, setPhase] = useState<'intro' | 'running'>(() =>
    hasQuizDraft(chapter.id) ? 'running' : 'intro',
  );
  const [attempt, setAttempt] = useState(0);
  const [reviewResult, setReviewResult] = useState<QuizResult | null>(null);
  const [settings, setSettings] = useState<QuizSettings>(
    () => activeDraft?.settings ?? STANDARD_QUIZ_SETTINGS,
  );
  const sessionQuestions = useMemo(() => {
    if (activeDraft?.chapterId !== chapter.id || activeDraft.questionIds.length === 0) {
      return questions;
    }
    const ids = new Set(activeDraft.questionIds);
    return chapter.prelims.filter((question) => ids.has(question.id));
  }, [activeDraft, chapter.id, chapter.prelims, questions]);
  const chapterHistory = useMemo(
    () => quizResults.filter((result) => result.chapterId === chapter.id),
    [quizResults, chapter.id],
  );

  const lastScore = useMemo(() => {
    const last = quizResults.find((r) => r.chapterId === chapter.id);
    return last ? { correct: last.correct, total: last.totalQuestions } : null;
  }, [quizResults, chapter.id]);

  if (activeDraft && activeDraft.chapterId !== chapter.id) {
    return (
      <EmptyState
        icon="clock"
        title="Another quiz is active"
        description="Finish your active timed quiz before starting a quiz from another chapter."
        action={
          <Button variant="primary" onClick={() => navigate(Routes.chapter(activeDraft.chapterId))}>
            Return to active quiz
          </Button>
        }
      />
    );
  }

  if (sessionQuestions.length === 0) {
    return (
      <EmptyState
        icon="target"
        title="No quiz available"
        description="This chapter has no prelims questions to build a quiz from."
      />
    );
  }

  if (phase === 'intro') {
    if (reviewResult) {
      const reviewedIds = reviewResult.perQuestion?.length
        ? new Set(reviewResult.perQuestion.map((question) => question.questionId))
        : null;
      return (
        <QuizResults
          historical
          questions={reviewedIds
            ? chapter.prelims.filter((question) => reviewedIds.has(question.id))
            : chapter.prelims}
          answers={reviewResult.answers}
          summary={{
            total: reviewResult.totalQuestions,
            answered: reviewResult.answered,
            correct: reviewResult.correct,
            skipped: reviewResult.skipped,
            accuracy: reviewResult.answered === 0 ? 0 : Math.round((reviewResult.correct / reviewResult.answered) * 100),
            durationMs: reviewResult.durationMs,
          }}
          includedInAnalytics={reviewResult.includedInAnalytics !== false}
          focusLossCount={reviewResult.focusLossCount}
          focusPenaltyTotal={reviewResult.focusPenaltyTotal}
          adjustedScore={reviewResult.adjustedScore}
          onAnalyticsChange={(included) => {
            setQuizResultAnalytics(reviewResult.id, included);
            setReviewResult({ ...reviewResult, includedInAnalytics: included });
          }}
          onRetry={() => undefined}
          onExit={() => setReviewResult(null)}
        />
      );
    }
    return <>
      <QuizIntro
        questionCount={sessionQuestions.length}
        lastScore={lastScore}
        onStart={(selectedSettings) => {
          setSettings(selectedSettings);
          setAttempt((a) => a + 1);
          setPhase('running');
        }}
      />
      <AttemptHistory results={chapterHistory} onReview={setReviewResult} />
    </>;
  }

  return (
    <QuizSession
      key={attempt}
      chapter={chapter}
      questions={sessionQuestions}
      settings={settings}
      onActiveChange={onActiveChange}
      onExit={() => {
        onActiveChange?.(false);
        setPhase('intro');
        onRequestLearning?.();
      }}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}

function AttemptHistory({
  results,
  onReview,
}: {
  results: ReturnType<typeof useUserData>['quizResults'];
  onReview: (result: QuizResult) => void;
}) {
  return (
    <section className={styles.history} aria-labelledby="quiz-history-title">
      <div className={styles.historyHead}>
        <div>
          <h2 id="quiz-history-title">Quiz history</h2>
          <p>Every submitted attempt is saved with your study data.</p>
        </div>
        <span className={styles.historyCount}>{results.length}</span>
      </div>
      {results.length === 0 ? (
        <div className={styles.historyEmpty}>
          <Icon name="clock" size={18} />
          <span>Your completed attempts will appear here.</span>
        </div>
      ) : (
        <ol className={styles.historyList}>
          {results.map((result, index) => {
            const accuracy = result.answered === 0
              ? 0
              : Math.round((result.correct / result.answered) * 100);
            return (
              <li key={result.id}>
                <button type="button" className={styles.historyItem} onClick={() => onReview(result)}>
                <span className={styles.attemptNumber}>#{results.length - index}</span>
                <div className={styles.attemptMain}>
                  <strong>{result.correct}/{result.totalQuestions} correct</strong>
                  <span>{new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(result.takenAt)}</span>
                </div>
                <div className={styles.attemptStats}>
                  <span><strong>{accuracy}%</strong> accuracy</span>
                  <span><strong>{humanizeDuration(result.durationMs)}</strong> time</span>
                  <span><strong>{result.skipped}</strong> skipped</span>
                  {(result.focusPenaltyTotal ?? 0) > 0 && <span><strong>−{result.focusPenaltyTotal}</strong> penalty</span>}
                  {result.includedInAnalytics === false && <span className={styles.excluded}>Excluded</span>}
                </div>
                <Icon name="chevronRight" size={17} className={styles.historyChevron} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
