import { useMemo, useState } from 'react';
import type { Chapter } from '../../../types';
import { useUserData } from '../../../context/UserDataContext';
import { EmptyState } from '../../common/EmptyState';
import { QuizIntro } from './QuizIntro';
import { QuizSession } from './QuizSession';
import { hasQuizDraft } from '../../../hooks/useQuizSession';

interface QuizRunnerProps {
  chapter: Chapter;
  questions?: Chapter['prelims'];
  onActiveChange?: (active: boolean) => void;
}

/** Entry point for Quiz mode: intro gate → a keyed, restartable session. */
export function QuizRunner({ chapter, questions = chapter.prelims, onActiveChange }: QuizRunnerProps) {
  const { quizResults } = useUserData();
  const [phase, setPhase] = useState<'intro' | 'running'>(() =>
    hasQuizDraft(chapter.id) ? 'running' : 'intro',
  );
  const [attempt, setAttempt] = useState(0);

  const lastScore = useMemo(() => {
    const last = quizResults.find((r) => r.chapterId === chapter.id);
    return last ? { correct: last.correct, total: last.totalQuestions } : null;
  }, [quizResults, chapter.id]);

  if (questions.length === 0) {
    return (
      <EmptyState
        icon="target"
        title="No quiz available"
        description="This chapter has no prelims questions to build a quiz from."
      />
    );
  }

  if (phase === 'intro') {
    return (
      <QuizIntro
        questionCount={questions.length}
        lastScore={lastScore}
        onStart={() => {
          setAttempt((a) => a + 1);
          setPhase('running');
        }}
      />
    );
  }

  return (
    <QuizSession
      key={attempt}
      chapter={chapter}
      questions={questions}
      onActiveChange={onActiveChange}
      onExit={() => {
        onActiveChange?.(false);
        setPhase('intro');
      }}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}
