import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chapter, QuizQuestionSet } from '../../../types';
import type { QuestionOriginKind } from '../../../utils/questionOrigin';
import { useUserData } from '../../../context/UserDataContext';
import { EmptyState } from '../../common/EmptyState';
import { QuizIntro } from './QuizIntro';
import {
  findActiveQuizDraft,
} from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { Routes } from '../../../constants/routes';
import { humanizeDuration } from '../../../utils/time';
import { createId } from '../../../utils/id';
import { saveQuizDefinition } from '../../../services/quiz';
import styles from './QuizRunner.module.css';

interface QuizRunnerProps {
  chapter: Chapter;
  questions?: Chapter['prelims'];
  origin?: 'all' | QuestionOriginKind;
  availableOrigins?: ReadonlySet<QuestionOriginKind>;
  onOrigin?: (origin: 'all' | QuestionOriginKind) => void;
  onActiveChange?: (active: boolean) => void;
  onImmersiveChange?: (immersive: boolean) => void;
}

/** Entry point for Quiz mode: intro gate → a keyed, restartable session. */
export function QuizRunner({
  chapter,
  questions = chapter.prelims,
  origin = 'all',
  availableOrigins = new Set<QuestionOriginKind>(),
  onOrigin,
  onActiveChange,
  onImmersiveChange,
}: QuizRunnerProps) {
  const { quizResults } = useUserData();
  const navigate = useNavigate();
  const activeDraft = findActiveQuizDraft();
  const [historyOpen, setHistoryOpen] = useState(false);
  const chapterHistory = useMemo(
    () => quizResults.filter((result) => result.chapterId === chapter.id),
    [quizResults, chapter.id],
  );

  const lastScore = useMemo(() => {
    const last = quizResults.find((r) => r.chapterId === chapter.id);
    return last ? { correct: last.correct, total: last.totalQuestions } : null;
  }, [quizResults, chapter.id]);

  if (activeDraft) {
    return (
      <EmptyState
        icon="clock"
        title="Another quiz is active"
        description="Finish your active timed quiz before starting a quiz from another chapter."
        action={
          <Button variant="primary" onClick={() => navigate(Routes.activeQuiz(activeDraft.quizId), { replace: true })}>
            Return to active quiz
          </Button>
        }
      />
    );
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        icon="target"
        title="No quiz available"
        description="This chapter has no prelims questions to build a quiz from."
      />
    );
  }

  return <>
      <QuizIntro
        chapterId={chapter.id}
        questions={questions}
        origin={origin}
        availableOrigins={availableOrigins}
        onOrigin={onOrigin}
        results={quizResults}
        lastScore={lastScore}
        onStart={(selectedSettings, selectedQuestionSet) => {
          const selectedIds = new Set(selectedQuestionSet.questionIds);
          const selectedQuestions = selectedQuestionSet.questionIds.length
            ? chapter.prelims.filter((question) => selectedIds.has(question.id))
            : questions;
          const quizId = createId();
          const questionSet: QuizQuestionSet = {
            ...selectedQuestionSet,
            questionIds: selectedQuestions.map((question) => question.id),
          };
          saveQuizDefinition({
            id: quizId,
            chapter,
            questions: selectedQuestions,
            settings: selectedSettings,
            questionSet,
            questionChapterIds: Object.fromEntries(selectedQuestions.map((question) => [question.id, chapter.id])),
            createdAt: Date.now(),
          });
          onActiveChange?.(true);
          onImmersiveChange?.(false);
          navigate(Routes.quizSession(quizId));
        }}
      />
      {chapterHistory.length > 0 && (
        <div className={styles.historyDisclosure}>
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen((open) => !open)}>
            <Icon name="clock" size={15} />
            {historyOpen ? 'Hide past attempts' : `Past attempts (${chapterHistory.length})`}
          </Button>
        </div>
      )}
      {historyOpen && chapterHistory.length > 0 && (
        <AttemptHistory
          results={chapterHistory}
          onReview={(resultId) => navigate(Routes.quizResult(resultId))}
        />
      )}
    </>;
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
