import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, Icon } from '../../components/common';
import { Page } from '../../components/layout';
import { QuizResults } from '../../components/quiz/QuizRunner/QuizResults';
import { Routes } from '../../constants/routes';
import {
  loadSharedQuiz,
  type SharedQuizSnapshot,
} from '../../services/supabase/quizShares';
import styles from './SharedQuizResult.module.css';

export function SharedQuizResultPage() {
  const { shareToken = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<
    { status: 'loading' } |
    { status: 'missing' } |
    { status: 'error' } |
    { status: 'ready'; snapshot: SharedQuizSnapshot }
  >({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void loadSharedQuiz(shareToken)
      .then((snapshot) => {
        if (active) setState(snapshot ? { status: 'ready', snapshot } : { status: 'missing' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => { active = false; };
  }, [shareToken]);

  if (state.status === 'loading') {
    return <Page narrow><p className={styles.loading}>Loading shared result…</p></Page>;
  }
  if (state.status !== 'ready') {
    return (
      <Page narrow>
        <EmptyState
          icon="close"
          title={state.status === 'missing' ? 'Share unavailable' : 'Could not load result'}
          description={state.status === 'missing'
            ? 'This link is invalid, expired, or has been revoked by its owner.'
            : 'The shared result could not be loaded. Please try again later.'}
          action={<Link className={styles.action} to={Routes.dashboard}>Open Revision Engine</Link>}
        />
      </Page>
    );
  }

  const { result, questions } = state.snapshot;
  return (
    <Page narrow>
      <header className={styles.header}>
        <span className={styles.mark}><Icon name="share" size={17} /></span>
        <div>
          <p>Shared quiz result</p>
          <h1>{result.chapterTitle ?? 'Quiz attempt'}</h1>
          <small>{new Intl.DateTimeFormat(undefined, {
            dateStyle: 'long',
            timeStyle: 'short',
          }).format(result.takenAt)}</small>
        </div>
      </header>
      <QuizResults
        historical
        exitLabel="Open Revision Engine"
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
        onRetry={() => navigate(Routes.dashboard)}
        onExit={() => navigate(Routes.dashboard)}
      />
    </Page>
  );
}
