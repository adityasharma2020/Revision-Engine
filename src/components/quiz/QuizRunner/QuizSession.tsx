import { useEffect, useRef } from 'react';
import type { Chapter, PrelimsQuestion } from '../../../types';
import { useElapsed } from '../../../hooks/useElapsed';
import { useQuizSession } from '../../../hooks/useQuizSession';
import { useUserData } from '../../../context/UserDataContext';
import { createId } from '../../../utils/id';
import { Button } from '../../common/Button';
import { QuizProgress } from './QuizProgress';
import { QuizQuestion } from './QuizQuestion';
import { QuizResults } from './QuizResults';
import styles from './QuizRunner.module.css';

interface QuizSessionProps {
  chapter: Chapter;
  questions: readonly PrelimsQuestion[];
  onExit: () => void;
  onRetry: () => void;
}

/** One live quiz run: active question flow → finished results. */
export function QuizSession({ chapter, questions, onExit, onRetry }: QuizSessionProps) {
  const { state, current, actions, summary } = useQuizSession(questions);
  const running = state.status === 'active';
  const elapsedMs = useElapsed(state.startedAt, running);
  const { recordQuizResult } = useUserData();

  // Per-question timing: bank the elapsed segment whenever the active question
  // changes (including when the quiz finishes). Handles back/forward navigation.
  const times = useRef<Record<string, number>>({});
  const segStart = useRef(Date.now());
  const activeQid = useRef<string | undefined>(questions[0]?.id);
  useEffect(() => {
    const now = Date.now();
    const qid = activeQid.current;
    if (qid) times.current[qid] = (times.current[qid] ?? 0) + (now - segStart.current);
    segStart.current = now;
    activeQid.current = current?.id;
  }, [state.currentIndex, state.status, current]);

  // Persist the finished session exactly once.
  const recorded = useRef(false);
  useEffect(() => {
    if (state.status !== 'finished' || recorded.current) return;
    recorded.current = true;
    const s = summary();
    const perQuestion = questions.map((q) => {
      const selected = state.answers[q.id] ?? null;
      return {
        questionId: q.id,
        selectedOption: selected,
        correct: selected != null ? selected === q.answer : null,
        timeMs: times.current[q.id] ?? 0,
        difficulty: q.difficulty,
        origin: q.origin,
      };
    });
    recordQuizResult({
      id: createId(),
      chapterId: chapter.id,
      subject: chapter.subject,
      totalQuestions: s.total,
      answered: s.answered,
      correct: s.correct,
      skipped: s.skipped,
      durationMs: s.durationMs,
      takenAt: Date.now(),
      answers: state.answers,
      perQuestion,
    });
  }, [state.status, state.answers, summary, recordQuizResult, chapter.id, chapter.subject, questions]);

  if (state.status === 'finished') {
    return (
      <QuizResults
        questions={questions}
        answers={state.answers}
        summary={summary()}
        onRetry={onRetry}
        onExit={onExit}
      />
    );
  }

  const index = state.currentIndex;
  const isLast = index === state.total - 1;
  const answeredCurrent = state.answers[current.id] != null;
  const answeredCount = Object.values(state.answers).filter((v) => v != null).length;

  const submit = () => {
    const remaining = state.total - answeredCount;
    if (remaining > 0) {
      const ok = window.confirm(
        `${remaining} question${remaining === 1 ? '' : 's'} unanswered. Submit anyway?`,
      );
      if (!ok) return;
    }
    actions.finish();
  };

  return (
    <div className={styles.session}>
      <div className={styles.sessionHead}>
        <QuizProgress
          current={index + 1}
          total={state.total}
          answered={answeredCount}
          elapsedMs={elapsedMs}
        />
        <Button variant="secondary" size="sm" onClick={submit}>
          Submit test
        </Button>
      </div>

      <QuizQuestion
        question={current}
        selected={state.answers[current.id] ?? null}
        onSelect={(optionId) => actions.answer(current.id, optionId)}
      />

      <div className={styles.controls}>
        <Button variant="ghost" onClick={actions.prev} disabled={index === 0}>
          Previous
        </Button>
        <div className={styles.controlsRight}>
          {!answeredCurrent && !isLast && (
            <Button variant="ghost" onClick={actions.next}>
              Skip
            </Button>
          )}
          <Button variant="primary" onClick={isLast ? submit : actions.next}>
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
