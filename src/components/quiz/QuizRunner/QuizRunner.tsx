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
import { Routes } from '../../../constants/routes';

interface QuizRunnerProps {
  chapter: Chapter;
  questions?: Chapter['prelims'];
  onActiveChange?: (active: boolean) => void;
}

/** Entry point for Quiz mode: intro gate → a keyed, restartable session. */
export function QuizRunner({ chapter, questions = chapter.prelims, onActiveChange }: QuizRunnerProps) {
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
        onStart={(selectedSettings) => {
          setSettings(selectedSettings);
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
      settings={settings}
      onActiveChange={onActiveChange}
      onExit={() => {
        onActiveChange?.(false);
        setPhase('intro');
      }}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}
