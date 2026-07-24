import { useEffect, useRef, useState } from 'react';
import type { Chapter, PrelimsQuestion, QuizQuestionSet } from '../../../types';
import { useElapsed } from '../../../hooks/useElapsed';
import { announceQuizLock, useQuizSession, type QuizSettings } from '../../../hooks/useQuizSession';
import { useUserData } from '../../../context/UserDataContext';
import { createId } from '../../../utils/id';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { usePdfWorkspace } from '../../../context/PdfWorkspaceContext';
import { QuizProgress } from './QuizProgress';
import { QuizQuestion } from './QuizQuestion';
import { QuizResults } from './QuizResults';
import styles from './QuizRunner.module.css';

interface QuizSessionProps {
  sessionId: string;
  chapter: Chapter;
  questions: readonly PrelimsQuestion[];
  onComplete: (resultId: string, score: { correct: number; total: number; answered: number; skipped: number }) => void;
  onActiveChange?: (active: boolean) => void;
  settings: QuizSettings;
  questionSet: QuizQuestionSet;
  /** Original chapter by question id for cross-chapter generated quizzes. */
  questionChapterIds?: Readonly<Record<string, string>>;
  questionRevisionMeta?: Readonly<Record<string, { attempts: number; accuracy: number | null; level: number; reason: string }>>;
  studyQuote?: { quote: string; author: string; topics: readonly string[] };
  purpose?: 'daily-revision';
  dailyDateKey?: string;
  /** Ephemeral interface preview: never persist a draft, attempt, result, or analytics event. */
  testRun?: boolean;
}

/** One live quiz run: active question flow → finished results. */
export function QuizSession({ sessionId, chapter, questions, onComplete, onActiveChange, settings, questionSet, questionChapterIds, questionRevisionMeta, studyQuote, purpose, dailyDateKey, testRun = false }: QuizSessionProps) {
  const pdfWorkspace = usePdfWorkspace();
  const quizId = sessionId;
  const { state, current, actions, summary } = useQuizSession(questions, quizId, settings, questionSet, !testRun);
  const running = state.status === 'active';
  const liveElapsedMs = useElapsed(state.startedAt, running);
  const elapsedMs = state.status === 'paused' && state.pausedAt
    ? Math.max(0, state.pausedAt - state.startedAt)
    : liveElapsedMs;
  const timeLimitMs = state.settings.timeLimitEnabled
    ? Math.max(1, Math.round(state.settings.secondsPerQuestion * state.total * 1000))
    : null;
  const remainingMs = timeLimitMs === null ? undefined : Math.max(0, timeLimitMs - elapsedMs);
  const timerUrgent = remainingMs !== undefined
    && remainingMs <= Math.min(60_000, timeLimitMs! * 0.1);
  const { recordQuizResult } = useUserData();
  const resultId = useRef(createId());
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [focusInterrupted, setFocusInterrupted] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const timedOut = useRef(false);
  const interruptionOpen = useRef(false);
  const paused = state.status === 'paused';
  const focusLossCount = state.focusInterruptions.length;
  const penalizedInterruptions = state.settings.focusPenaltyEnabled
    ? Math.max(0, focusLossCount - state.settings.focusLossGrace)
    : 0;
  const focusPenaltyTotal = penalizedInterruptions * state.settings.focusPenaltyPerLoss;
  const chapterPdf = pdfWorkspace.documents.find((item) => item.linkedChapterIds.includes(chapter.id)) ?? null;

  useEffect(() => {
    onActiveChange?.(state.status === 'active');
    announceQuizLock(
      state.status === 'finished' || testRun ? null : quizId,
      !testRun && state.status === 'active' && state.settings.lockNavigation,
    );
  }, [state.status, state.settings.lockNavigation, onActiveChange, quizId, testRun]);

  useEffect(() => {
    if (!testRun || state.status !== 'finished' || !document.fullscreenElement) return;
    void document.exitFullscreen().catch(() => undefined);
  }, [state.status, testRun]);

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
    if (
      state.status !== 'active'
      || !state.settings.timeLimitEnabled
      || !state.settings.autoSubmitOnTimeEnd
      || remainingMs === undefined
      || remainingMs > 0
    ) return;
    timedOut.current = true;
    setSubmitOpen(false);
    actions.finish();
  }, [actions, remainingMs, state.settings.autoSubmitOnTimeEnd, state.settings.timeLimitEnabled, state.status]);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!submitOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSubmitOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [submitOpen]);

  useEffect(() => {
    const moveBetweenQuestions = (event: KeyboardEvent) => {
      if (state.status !== 'active' || focusInterrupted) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

      if (event.key === 'ArrowLeft' && state.currentIndex > 0) {
        event.preventDefault();
        actions.prev();
      }
      if (event.key === 'ArrowRight' && state.currentIndex < state.total - 1) {
        event.preventDefault();
        actions.next();
      }
    };

    window.addEventListener('keydown', moveBetweenQuestions);
    return () => window.removeEventListener('keydown', moveBetweenQuestions);
  }, [actions, focusInterrupted, state.currentIndex, state.status, state.total]);

  // Per-question timing: bank the elapsed segment whenever the active question
  // changes (including when the quiz finishes). Handles back/forward navigation.
  const times = useRef<Record<string, number>>({});
  const segStart = useRef(Date.now());
  const activeQid = useRef<string | undefined>(questions[0]?.id);
  const segmentStatus = useRef(state.status);
  useEffect(() => {
    const now = Date.now();
    const qid = activeQid.current;
    if (qid && segmentStatus.current === 'active') {
      times.current[qid] = (times.current[qid] ?? 0) + (now - segStart.current);
    }
    segStart.current = now;
    activeQid.current = current?.id;
    segmentStatus.current = state.status;
  }, [state.currentIndex, state.status, current]);

  // Persist the finished session exactly once.
  const recorded = useRef(false);
  useEffect(() => {
    if (state.status !== 'finished' || recorded.current || testRun) return;
    recorded.current = true;
    const s = summary();
    const perQuestion = questions.map((q) => {
      const selected = state.answers[q.id] ?? null;
      return {
        questionId: q.id,
        chapterId: questionChapterIds?.[q.id] ?? chapter.id,
        questionStatement: q.statement,
        tags: q.tags,
        selectedOption: selected,
        correct: selected != null ? selected === q.answer : null,
        timeMs: times.current[q.id] ?? 0,
        difficulty: q.difficulty,
        origin: q.origin,
      };
    });
    recordQuizResult({
      id: resultId.current,
      quizId,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      subject: chapter.subject,
      totalQuestions: s.total,
      answered: s.answered,
      correct: s.correct,
      skipped: s.skipped,
      durationMs: timedOut.current && timeLimitMs !== null ? timeLimitMs : s.durationMs,
      takenAt: Date.now(),
      answers: state.answers,
      questions,
      perQuestion,
      questionSet,
      includedInAnalytics: true,
      settings: state.settings,
      focusLossCount,
      focusInterruptions: state.focusInterruptions,
      focusPenaltyTotal,
      adjustedScore: s.correct - focusPenaltyTotal,
      timedOut: timedOut.current,
      purpose,
      dailyDateKey,
    });
    const finishNavigation = async () => {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Navigation must still complete if the browser has already ended
          // fullscreen or rejects the exit request.
        }
      }
      onComplete(resultId.current, { correct: s.correct, total: s.total, answered: s.answered, skipped: s.skipped });
    };
    void finishNavigation();
  }, [state.status, state.answers, state.settings, state.focusInterruptions, summary, recordQuizResult, onComplete, quizId, chapter.id, chapter.title, chapter.subject, questions, questionSet, questionChapterIds, focusLossCount, focusPenaltyTotal, timeLimitMs, purpose, dailyDateKey, testRun]);

  if (state.status === 'finished' && testRun) {
    const testSummary = summary();
    return (
      <div className={styles.testResult}>
        <p className={styles.testResultNotice}><Icon name="monitor" size={15} /><strong>Test run</strong><span>This result is temporary and was not saved anywhere.</span></p>
        <QuizResults
          questions={questions}
          answers={state.answers}
          summary={testSummary}
          onRetry={actions.restart}
          onExit={() => onComplete(resultId.current, {
            correct: testSummary.correct,
            total: testSummary.total,
            answered: testSummary.answered,
            skipped: testSummary.skipped,
          })}
          exitLabel="Exit test run"
          focusLossCount={focusLossCount}
          focusPenaltyTotal={focusPenaltyTotal}
          adjustedScore={testSummary.correct - focusPenaltyTotal}
          focusPenaltyPolicy={{
            enabled: state.settings.focusPenaltyEnabled,
            warningsAllowed: state.settings.focusLossGrace,
            deductionPerExit: state.settings.focusPenaltyPerLoss,
          }}
          chapterId={chapter.id}
        />
      </div>
    );
  }

  if (state.status === 'finished') {
    return <p className={styles.savingResult}>Saving your result…</p>;
  }

  const index = state.currentIndex;
  const isLast = index === state.total - 1;
  const answeredCurrent = state.answers[current.id] != null;
  const answeredCount = Object.values(state.answers).filter((v) => v != null).length;

  const submit = () => {
    setSubmitOpen(true);
  };

  const confirmSubmit = () => {
    setSubmitOpen(false);
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
          remainingMs={remainingMs}
          urgent={timerUrgent}
        />
        <div className={styles.sessionActions}>
          {testRun && <span className={styles.testRunBadge}>Test run · not saved</span>}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => chapterPdf
              ? pdfWorkspace.document?.id === chapterPdf.id && pdfWorkspace.visible
                ? pdfWorkspace.setVisible(false)
                : pdfWorkspace.openDocument(chapterPdf.id)
              : pdfWorkspace.chooseDocument(chapter.id)}
            title={chapterPdf
              ? pdfWorkspace.document?.id === chapterPdf.id && pdfWorkspace.visible ? 'Hide reference PDF' : 'Show reference PDF'
              : 'Open a local or linked reference PDF'}
            aria-label={chapterPdf
              ? pdfWorkspace.document?.id === chapterPdf.id && pdfWorkspace.visible ? 'Hide reference PDF' : 'Show reference PDF'
              : 'Open a local or linked reference PDF'}
          >
            <Icon name="book" size={15} />
          </Button>
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
          <Button variant="secondary" size="sm" onClick={submit} disabled={paused}>Submit quiz</Button>
        </div>
      </div>

      {studyQuote && (
        <aside className={styles.studyQuote} aria-label="Today’s UPSC quote">
          <Icon name="book" size={17} />
          <blockquote>“{studyQuote.quote}” <cite>— {studyQuote.author}</cite></blockquote>
          {studyQuote.topics.length > 0 && <span>{studyQuote.topics.slice(0, 2).join(' · ')}</span>}
        </aside>
      )}

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
      {submitOpen && (
        <div className={styles.submitGuard} onMouseDown={() => setSubmitOpen(false)}>
          <section
            className={styles.submitDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-quiz-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className={styles.submitIcon}><Icon name="check" size={22} /></span>
            <h2 id="submit-quiz-title">Submit this quiz?</h2>
            <p>
              {answeredCount === state.total
                ? testRun ? 'You have answered every question. This temporary result will not be saved.' : 'You have answered every question. Your result will be saved to quiz history.'
                : `${state.total - answeredCount} question${state.total - answeredCount === 1 ? '' : 's'} will be marked as skipped.`}
            </p>
            <div className={styles.submitStats}>
              <span><strong>{state.total}</strong><small>Total</small></span>
              <span><strong>{answeredCount}</strong><small>Answered</small></span>
              <span className={state.total === answeredCount ? undefined : styles.submitSkipped}>
                <strong>{state.total - answeredCount}</strong><small>Skipped</small>
              </span>
            </div>
            <div className={styles.submitActions}>
              <Button variant="secondary" onClick={() => setSubmitOpen(false)}>Keep reviewing</Button>
              <Button variant="primary" onClick={confirmSubmit} autoFocus>Submit quiz</Button>
            </div>
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
        chapterId={questionChapterIds?.[current.id] ?? chapter.id}
        question={current}
        revisionMeta={questionRevisionMeta?.[current.id]}
        selected={state.answers[current.id] ?? null}
        onSelect={(optionId) => {
          if (state.answers[current.id] === optionId) actions.clear(current.id);
          else actions.answer(current.id, optionId);
        }}
        disabled={paused}
      />

      <div className={styles.controls}>
        <Button
          variant="ghost"
          onClick={actions.prev}
          disabled={paused || index === 0}
          aria-keyshortcuts="ArrowLeft"
          title="Previous question (←)"
        >
          Previous
        </Button>
        <span className={styles.shortcutHint} aria-hidden="true">← / → to move</span>
        <div className={styles.controlsRight}>
          {!answeredCurrent && !isLast && (
            <Button variant="ghost" onClick={actions.next} disabled={paused}>
              Skip
            </Button>
          )}
          <Button
            variant="primary"
            onClick={isLast ? submit : actions.next}
            disabled={paused}
            aria-keyshortcuts={isLast ? undefined : 'ArrowRight'}
            title={isLast ? 'Finish quiz' : 'Next question (→)'}
          >
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
