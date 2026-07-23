import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AsyncBoundary, EmptyState, Icon } from '../../components/common';
import { Button } from '../../components/common';
import { Page } from '../../components/layout';
import { QuizResults } from '../../components/quiz/QuizRunner/QuizResults';
import { Routes } from '../../constants/routes';
import { useUserData } from '../../context/UserDataContext';
import { useChapter } from '../../hooks/useChapters';
import type { QuizResult } from '../../types';
import {
  createQuizShare,
  getActiveQuizShare,
  revokeQuizShare,
} from '../../services/supabase/quizShares';
import { useAuth } from '../../context/AuthContext';
import styles from './QuizResult.module.css';
import { questionAttemptStats } from '../../utils/questionStats';
import { DeleteQuizDialog } from '../../components/quiz/DeleteQuizDialog';
import { useDailyRevisionAssignment } from '../../hooks/useDailyRevisionAssignment';

export function QuizResultPage() {
  const { resultId = '' } = useParams();
  const { ready, quizResults } = useUserData();
  const result = quizResults.find((item) => item.id === resultId);

  return (
    <Page narrow>
      {!ready ? (
        <p className={styles.loading}>Loading saved result…</p>
      ) : result ? (
        <LoadedResult result={result} />
      ) : (
        <EmptyState
          icon="clock"
          title="Result not found"
          description="This private result is not available on the current account or device."
          action={<Link className={styles.action} to={Routes.library}>Go to library</Link>}
        />
      )}
    </Page>
  );
}

function LoadedResult({ result }: { result: QuizResult }) {
  const chapterSnapshot = useMemo(() => result.questions?.length ? ({
      id: result.chapterId,
      title: result.chapterTitle ?? 'Generated quiz',
      subject: result.subject ?? 'Mixed subjects',
      chapterNumber: 0,
      prelims: result.questions,
      mains: [],
    }) : undefined, [result]);
  const chapterState = useChapter(result.chapterId, chapterSnapshot);
  const navigate = useNavigate();
  const { quizResults, setQuizResultAnalytics } = useUserData();
  const { status } = useAuth();
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [showOwner, setShowOwner] = useState(true);
  const [shareStatus, setShareStatus] = useState<'idle' | 'working' | 'copied' | 'error'>('idle');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { assignment, clear: clearAssignment } = useDailyRevisionAssignment();

  useEffect(() => {
    if (status !== 'authenticated') return;
    void getActiveQuizShare(result.id)
      .then((share) => {
        setShareToken(share?.shareToken ?? null);
        if (share) setShowOwner(share.showOwner);
      })
      .catch(() => setShareStatus('error'));
  }, [result.id, status]);

  return (
    <>
      <Link to={result.chapterId === 'daily-revision' ? Routes.revision : Routes.chapter(result.chapterId)} className={styles.back}>
        <Icon name="arrowLeft" size={16} />
        Quiz history
      </Link>
      <AsyncBoundary state={chapterState} loadingLabel="Loading result details…">
        {(chapter) => {
          const reviewedIds = result.perQuestion?.length
            ? new Set(result.perQuestion.map((question) => question.questionId))
            : null;
          const questions = reviewedIds
            ? chapter.prelims.filter((question) => reviewedIds.has(question.id))
            : chapter.prelims;
          return (
            <>
              <header className={styles.header}>
                <button type="button" className={styles.deleteAttempt} onClick={() => setDeleteOpen(true)} aria-label="Delete this quiz attempt" title="Delete quiz attempt"><Icon name="trash" size={16} /></button>
                <div>
                  <span>Saved result</span>
                  <h1>{result.chapterTitle ?? 'Quiz attempt'}</h1>
                  <p>{new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  }).format(result.takenAt)}</p>
                  <div className={styles.resultContext}>
                    <span>{result.questionSet?.label ?? 'Full chapter'}</span>
                    {(result.purpose === 'daily-revision' || result.chapterId === 'daily-revision') && (
                      <span>Daily Revision · {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(result.dailyDateKey ? new Date(`${result.dailyDateKey}T12:00:00`) : result.takenAt)}</span>
                    )}
                    {result.timedOut && <span>Time expired · automatically submitted</span>}
                    <span>
                      {result.totalQuestions}/{result.questionSet?.sourceQuestionCount ?? result.totalQuestions} questions
                      {result.questionSet && result.questionSet.type !== 'full' ? ' · targeted quiz' : ' · full quiz'}
                    </span>
                  </div>
                </div>
                {status === 'authenticated' && (
                  <div className={styles.shareActions}>
                    <label className={styles.identityChoice}>
                      <input
                        type="checkbox"
                        checked={showOwner}
                        onChange={(event) => setShowOwner(event.target.checked)}
                      />
                      Show my name and photo
                    </label>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={shareStatus === 'working'}
                      onClick={async () => {
                        setShareStatus('working');
                        try {
                          const token = await createQuizShare(result, questions, showOwner);
                          setShareToken(token);
                          await navigator.clipboard.writeText(
                            `${window.location.origin}${Routes.sharedQuizResult(token)}`,
                          );
                          setShareStatus('copied');
                        } catch {
                          setShareStatus('error');
                        }
                      }}
                    >
                      <Icon name={shareStatus === 'copied' ? 'check' : 'share'} size={15} />
                      {shareStatus === 'working'
                        ? 'Preparing…'
                        : shareStatus === 'copied' ? 'Link copied' : 'Share result'}
                    </Button>
                    {shareToken && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          setShareStatus('working');
                          try {
                            await revokeQuizShare(shareToken);
                            setShareToken(null);
                            setShareStatus('idle');
                          } catch {
                            setShareStatus('error');
                          }
                        }}
                      >
                        Stop sharing
                      </Button>
                    )}
                    {shareStatus === 'error' && <small>Sharing is temporarily unavailable. Please try again.</small>}
                  </div>
                )}
              </header>
              <QuizResults
              historical
              chapterId={result.chapterId}
              questions={questions}
              answers={result.answers}
              summary={{
                total: result.totalQuestions,
                answered: result.answered,
                correct: result.correct,
                skipped: result.skipped,
                accuracy: result.answered === 0
                  ? 0
                  : Math.round((result.correct / result.answered) * 100),
                durationMs: result.durationMs,
              }}
              includedInAnalytics={result.includedInAnalytics !== false}
              focusLossCount={result.focusLossCount}
              focusPenaltyTotal={result.focusPenaltyTotal}
              adjustedScore={result.adjustedScore}
              focusPenaltyPolicy={{
                enabled: result.settings?.focusPenaltyEnabled ?? false,
                warningsAllowed: result.settings?.focusLossGrace ?? 3,
                deductionPerExit: result.settings?.focusPenaltyPerLoss ?? 0.25,
              }}
              questionHistory={questionAttemptStats(quizResults, result.chapterId)}
              onAnalyticsChange={(included) => setQuizResultAnalytics(result.id, included)}
              onRetry={() => navigate(result.chapterId === 'daily-revision' ? Routes.revision : Routes.chapter(result.chapterId))}
              onExit={() => navigate(result.chapterId === 'daily-revision' ? Routes.revision : Routes.chapter(result.chapterId))}
              />
              {deleteOpen && <DeleteQuizDialog result={result} onClose={() => setDeleteOpen(false)} onDeleted={() => {
                if (shareToken) void revokeQuizShare(shareToken);
                if (assignment?.resultId === result.id) {
                  clearAssignment();
                }
                navigate(result.purpose === 'daily-revision' || result.chapterId === 'daily-revision' ? Routes.revision : Routes.chapter(result.chapterId), { replace: true });
              }} />}
            </>
          );
        }}
      </AsyncBoundary>
    </>
  );
}
