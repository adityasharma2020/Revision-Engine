import { useEffect, useState } from 'react';
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
  const chapterState = useChapter(result.chapterId);
  const navigate = useNavigate();
  const { setQuizResultAnalytics } = useUserData();
  const { status } = useAuth();
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [showOwner, setShowOwner] = useState(true);
  const [shareStatus, setShareStatus] = useState<'idle' | 'working' | 'copied' | 'error'>('idle');

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
      <Link to={Routes.chapter(result.chapterId)} className={styles.back}>
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
                <div>
                  <span>Saved result</span>
                  <h1>{result.chapterTitle ?? 'Quiz attempt'}</h1>
                  <p>{new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  }).format(result.takenAt)}</p>
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
                    {shareStatus === 'error' && <small>Sharing failed. Check Supabase setup.</small>}
                  </div>
                )}
              </header>
              <QuizResults
              historical
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
              onAnalyticsChange={(included) => setQuizResultAnalytics(result.id, included)}
              onRetry={() => navigate(Routes.chapter(result.chapterId))}
              onExit={() => navigate(Routes.chapter(result.chapterId))}
              />
            </>
          );
        }}
      </AsyncBoundary>
    </>
  );
}
