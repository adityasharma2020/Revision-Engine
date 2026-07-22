import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chapter, QuizQuestionSet } from '../../../types';
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
import styles from './QuizRunner.module.css';

interface QuizRunnerProps {
  chapter: Chapter;
  questions?: Chapter['prelims'];
  onActiveChange?: (active: boolean) => void;
  onImmersiveChange?: (immersive: boolean) => void;
}

/** Entry point for Quiz mode: intro gate → a keyed, restartable session. */
export function QuizRunner({
  chapter,
  questions = chapter.prelims,
  onActiveChange,
  onImmersiveChange,
}: QuizRunnerProps) {
  const { quizResults } = useUserData();
  const navigate = useNavigate();
  const activeDraft = findActiveQuizDraft();
  const [phase, setPhase] = useState<'intro' | 'running'>(() =>
    hasQuizDraft(chapter.id) ? 'running' : 'intro',
  );
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<QuizSettings>(
    () => activeDraft?.settings ?? STANDARD_QUIZ_SETTINGS,
  );
  const [questionSet, setQuestionSet] = useState<QuizQuestionSet>(() => activeDraft?.questionSet ?? {
    type: activeDraft?.questionIds.length ? 'custom' : 'full',
    label: activeDraft?.questionIds.length ? 'Saved selection' : 'All questions',
    questionIds: activeDraft?.questionIds.length
      ? activeDraft.questionIds
      : questions.map((question) => question.id),
    sourceQuestionCount: questions.length,
  });
  const sessionQuestions = useMemo(() => {
    const selectedIds = activeDraft?.chapterId === chapter.id && activeDraft.questionIds.length > 0
      ? activeDraft.questionIds
      : questionSet.questionIds;
    if (selectedIds.length === 0) return questions;
    const ids = new Set(selectedIds);
    return chapter.prelims.filter((question) => ids.has(question.id));
  }, [activeDraft, chapter.id, chapter.prelims, questionSet.questionIds, questions]);
  const chapterHistory = useMemo(
    () => quizResults.filter((result) => result.chapterId === chapter.id),
    [quizResults, chapter.id],
  );

  useEffect(() => {
    onImmersiveChange?.(phase === 'running');
    return () => onImmersiveChange?.(false);
  }, [phase, onImmersiveChange]);

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
          <Button variant="primary" onClick={() => navigate(Routes.quiz(activeDraft.chapterId), { replace: true })}>
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
    return <>
      <QuizIntro
        chapterId={chapter.id}
        questions={questions}
        results={quizResults}
        lastScore={lastScore}
        onStart={(selectedSettings, selectedQuestionSet) => {
          setSettings(selectedSettings);
          setQuestionSet(selectedQuestionSet);
          setAttempt((a) => a + 1);
          setPhase('running');
        }}
      />
      <AttemptHistory
        results={chapterHistory}
        onReview={(resultId) => navigate(Routes.quizResult(resultId))}
      />
    </>;
  }

  return (
    <QuizSession
      key={attempt}
      chapter={chapter}
      questions={sessionQuestions}
      settings={settings}
      questionSet={activeDraft?.questionSet ?? questionSet}
      onActiveChange={onActiveChange}
      onComplete={(resultId) => navigate(Routes.quizResult(resultId), { replace: true })}
    />
  );
}

function AttemptHistory({
  results,
  onReview,
}: {
  results: ReturnType<typeof useUserData>['quizResults'];
  onReview: (resultId: string) => void;
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
                <button type="button" className={styles.historyItem} onClick={() => onReview(result.id)}>
                <span className={styles.attemptNumber}>#{results.length - index}</span>
                <div className={styles.attemptMain}>
                  <strong>{result.correct}/{result.totalQuestions} correct</strong>
                  <span>{new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(result.takenAt)}</span>
                  {result.questionSet && result.questionSet.type !== 'full' && (
                    <em>{result.questionSet.label} · targeted quiz</em>
                  )}
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
