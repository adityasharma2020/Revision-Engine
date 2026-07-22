import { useEffect, useRef, useState } from 'react';
import type { Chapter, PrelimsQuestion } from '../../../types';
import { useElapsed } from '../../../hooks/useElapsed';
import { announceQuizLock, useQuizSession, type QuizSettings } from '../../../hooks/useQuizSession';
import { useUserData } from '../../../context/UserDataContext';
import { createId } from '../../../utils/id';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { QuizProgress } from './QuizProgress';
import { QuizQuestion } from './QuizQuestion';
import styles from './QuizRunner.module.css';

interface QuizSessionProps {
  chapter: Chapter;
  questions: readonly PrelimsQuestion[];
  onComplete: (resultId: string) => void;
  onActiveChange?: (active: boolean) => void;
  settings: QuizSettings;
}

/** One live quiz run: active question flow → finished results. */
export function QuizSession({ chapter, questions, onComplete, onActiveChange, settings }: QuizSessionProps) {
  const { state, current, actions, summary } = useQuizSession(questions, chapter.id, settings);
  const running = state.status === 'active';
  const liveElapsedMs = useElapsed(state.startedAt, running);
  const elapsedMs = state.status === 'paused' && state.pausedAt
    ? Math.max(0, state.pausedAt - state.startedAt)
    : liveElapsedMs;
  const { recordQuizResult } = useUserData();
  const resultId = useRef(createId());
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [focusInterrupted, setFocusInterrupted] = useState(false);
  const interruptionOpen = useRef(false);
  const paused = state.status === 'paused';
  const focusLossCount = state.focusInterruptions.length;
  const penalizedInterruptions = state.settings.focusPenaltyEnabled
    ? Math.max(0, focusLossCount - state.settings.focusLossGrace)
    : 0;
  const focusPenaltyTotal = penalizedInterruptions * state.settings.focusPenaltyPerLoss;

  useEffect(() => {
    onActiveChange?.(state.status === 'active');
    announceQuizLock(
      state.status === 'finished' ? null : chapter.id,
      state.status === 'active' && state.settings.lockNavigation,
    );
  }, [state.status, state.settings.lockNavigation, onActiveChange, chapter.id]);

  useEffect(() => {
    if (!state.settings.trackFocusLoss || state.status !== 'active') return;
    const recordInterruption = () => {
      if (interruptionOpen.current) return;
      interruptionOpen.current = true;
      setFocusInterrupted(true);
      actions.recordFocusLoss();
    };
    const visibility = () => {
      if (document.hidden) recordInterruption();
    };
    const blur = () => recordInterruption();
    const guardShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const browserExit = (event.metaKey || event.ctrlKey) && ['l', 't', 'n', 'w'].includes(key);
      if (!browserExit) return;
      event.preventDefault();
      event.stopPropagation();
      recordInterruption();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', guardShortcuts, true);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', guardShortcuts, true);
    };
  }, [state.settings.trackFocusLoss, state.status, actions]);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

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
      id: resultId.current,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      subject: chapter.subject,
      totalQuestions: s.total,
      answered: s.answered,
      correct: s.correct,
      skipped: s.skipped,
      durationMs: s.durationMs,
      takenAt: Date.now(),
      answers: state.answers,
      perQuestion,
      includedInAnalytics: true,
      settings: state.settings,
      focusLossCount,
      focusInterruptions: state.focusInterruptions,
      focusPenaltyTotal,
      adjustedScore: s.correct - focusPenaltyTotal,
    });
    onComplete(resultId.current);
  }, [state.status, state.answers, state.settings, state.focusInterruptions, summary, recordQuizResult, onComplete, chapter.id, chapter.title, chapter.subject, questions, focusLossCount, focusPenaltyTotal]);

  if (state.status === 'finished') {
    return <p className={styles.savingResult}>Saving your result…</p>;
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

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
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
        <div className={styles.sessionActions}>
          {state.settings.allowPause && (
            <Button variant="ghost" size="sm" onClick={paused ? actions.resume : actions.pause}>
              <Icon name={paused ? 'target' : 'clock'} size={15} />
              {paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void toggleFullscreen()}
            disabled={state.settings.trackFocusLoss && fullscreen}
            title={state.settings.trackFocusLoss && fullscreen
              ? 'Fullscreen stays enabled while focus tracking is active.'
              : undefined}
          >
            <Icon name={fullscreen ? 'minimize' : 'expand'} size={15} />
            {state.settings.trackFocusLoss && fullscreen
              ? 'Strict full screen'
              : fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
          <Button variant="secondary" size="sm" onClick={submit} disabled={paused}>Submit test</Button>
        </div>
      </div>

      {paused && (
        <div className={styles.pausedBanner} role="status">
          <Icon name="clock" size={18} />
          <div><strong>Quiz paused</strong><span>The timer and all question controls are frozen.</span></div>
          <Button variant="primary" size="sm" onClick={actions.resume}>Resume quiz</Button>
        </div>
      )}
      {focusInterrupted && !paused && (
        <div className={styles.focusGuard} role="presentation">
          <section className={styles.focusDialog} role="alertdialog" aria-modal="true" aria-labelledby="focus-title">
            <span className={styles.focusIcon}><Icon name="target" size={22} /></span>
            <h2 id="focus-title">Focus left the quiz</h2>
            <p>
              Strict mode detected another tab, window, or app. The timer kept
              running and this interruption was recorded. Browsers cannot fully
              block system-level switching, but quiz controls stay locked until
              you acknowledge it.
            </p>
            <div className={styles.focusMeta}>
              Interruption {focusLossCount}
              {state.settings.focusPenaltyEnabled && (
                focusLossCount <= state.settings.focusLossGrace
                  ? ` · Warning ${focusLossCount} of ${state.settings.focusLossGrace}`
                  : ` · −${state.settings.focusPenaltyPerLoss} mark penalty`
              )}
            </div>
            <Button variant="primary" onClick={() => {
              interruptionOpen.current = false;
              setFocusInterrupted(false);
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen().catch(() => undefined);
              }
            }}>
              Return to quiz
            </Button>
          </section>
        </div>
      )}

      <nav className={styles.questionNav} aria-label="Quiz questions">
        {questions.map((question, questionIndex) => {
          const answered = state.answers[question.id] != null;
          const currentQuestion = questionIndex === index;
          return (
            <button
              key={question.id}
              type="button"
              className={currentQuestion ? styles.navCurrent : answered ? styles.navAnswered : styles.navQuestion}
              aria-label={`Question ${questionIndex + 1}${answered ? ', answered' : ', unanswered'}`}
              aria-current={currentQuestion ? 'step' : undefined}
              onClick={() => actions.goto(questionIndex)}
              disabled={paused}
            >
              {questionIndex + 1}
            </button>
          );
        })}
      </nav>

      <QuizQuestion
        question={current}
        selected={state.answers[current.id] ?? null}
        onSelect={(optionId) => actions.answer(current.id, optionId)}
        disabled={paused}
      />

      <div className={styles.controls}>
        <Button variant="ghost" onClick={actions.prev} disabled={paused || index === 0}>
          Previous
        </Button>
        <div className={styles.controlsRight}>
          {!answeredCurrent && !isLast && (
            <Button variant="ghost" onClick={actions.next} disabled={paused}>
              Skip
            </Button>
          )}
          <Button variant="primary" onClick={isLast ? submit : actions.next} disabled={paused}>
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
