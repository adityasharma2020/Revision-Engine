import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { PrelimsQuestion, QuizAnswerMap, QuizQuestionSet, QuizSettings } from '../types';
export type { QuizSettings } from '../types';

export interface QuizSessionState {
  status: 'active' | 'paused' | 'finished';
  settings: QuizSettings;
  total: number;
  currentIndex: number;
  answers: QuizAnswerMap;
  startedAt: number;
  finishedAt: number | null;
  pausedAt: number | null;
  focusInterruptions: number[];
}

export const STANDARD_QUIZ_SETTINGS: QuizSettings = {
  allowPause: true,
  lockNavigation: false,
  trackFocusLoss: false,
  allowQuit: true,
  focusPenaltyEnabled: false,
  focusLossGrace: 3,
  focusPenaltyPerLoss: 0.25,
  timeLimitEnabled: true,
  secondsPerQuestion: 72,
  autoSubmitOnTimeEnd: true,
};

export const STRICT_QUIZ_SETTINGS: QuizSettings = {
  allowPause: false,
  lockNavigation: true,
  trackFocusLoss: true,
  allowQuit: false,
  focusPenaltyEnabled: true,
  focusLossGrace: 3,
  focusPenaltyPerLoss: 0.25,
  timeLimitEnabled: true,
  secondsPerQuestion: 72,
  autoSubmitOnTimeEnd: true,
};

export function loadLastQuizSettings(fallback: QuizSettings = STANDARD_QUIZ_SETTINGS): QuizSettings {
  return { ...fallback };
}

export function saveLastQuizSettings(_settings: QuizSettings): void {
  // Session choices intentionally apply only to the quiz being launched.
}

type QuizAction =
  | { type: 'answer'; questionId: string; optionId: string }
  | { type: 'clear'; questionId: string }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'finish' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'recordFocusLoss'; at: number }
  | { type: 'restart' };

function init(total: number, settings: QuizSettings): QuizSessionState {
  return {
    status: 'active',
    settings,
    total,
    currentIndex: 0,
    answers: {},
    startedAt: Date.now(),
    finishedAt: null,
    pausedAt: null,
    focusInterruptions: [],
  };
}

interface StoredQuizDraft {
  version: 1 | 2 | 3;
  questionIds: string[];
  questionSet?: QuizQuestionSet;
  state: QuizSessionState;
}

export function quizDraftKey(quizId: string): string {
  return `revision-engine:quiz-draft:${quizId}`;
}

const QUIZ_DRAFT_PREFIX = 'revision-engine:quiz-draft:';
const QUIZ_DEFINITION_PREFIX = 'revision-engine:quiz-definition:';

export function findActiveQuizDraft(): {
  quizId: string;
  status: 'active' | 'paused';
  settings: QuizSettings;
  questionIds: readonly string[];
  questionSet?: QuizQuestionSet;
} | null {
  let latest: ({
    quizId: string;
    status: 'active' | 'paused';
    settings: QuizSettings;
    questionIds: readonly string[];
    questionSet?: QuizQuestionSet;
  } & { startedAt: number }) | null = null;
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(QUIZ_DRAFT_PREFIX)) {
        try {
          const quizId = key.slice(QUIZ_DRAFT_PREFIX.length);
          if (!sessionStorage.getItem(`${QUIZ_DEFINITION_PREFIX}${quizId}`)) {
            sessionStorage.removeItem(key);
            index -= 1;
            continue;
          }
          const raw = sessionStorage.getItem(key);
          const draft = raw ? JSON.parse(raw) as StoredQuizDraft : null;
          if (!draft || !['active', 'paused'].includes(draft.state.status)) continue;
          const candidate = {
            quizId,
            status: draft.state.status as 'active' | 'paused',
            settings: settingsFromDraft(draft.state),
            questionIds: draft.questionIds ?? [],
            questionSet: draft.questionSet,
            startedAt: draft.state.startedAt ?? 0,
          };
          if (!latest || candidate.startedAt > latest.startedAt) latest = candidate;
        } catch {
          // Ignore a corrupt/stale entry and continue looking for a valid run.
        }
      }
    }
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  if (!latest) return null;
  const { startedAt: _startedAt, ...draft } = latest;
  return draft;
}

export function announceQuizLock(quizId: string | null, locked = false): void {
  window.dispatchEvent(
    new CustomEvent('revision-engine:quiz-lock', { detail: { quizId, locked } }),
  );
}

export function abandonQuizDraft(quizId: string): void {
  try {
    sessionStorage.removeItem(quizDraftKey(quizId));
  } finally {
    announceQuizLock(null, false);
  }
}

function settingsFromDraft(state?: QuizSessionState & { policy?: 'standard' | 'strict' }): QuizSettings {
  if (state?.settings) return { ...STANDARD_QUIZ_SETTINGS, ...state.settings };
  return state?.policy === 'standard' ? STANDARD_QUIZ_SETTINGS : STRICT_QUIZ_SETTINGS;
}

function restoreDraft(key: string, questions: readonly PrelimsQuestion[], settings: QuizSettings): QuizSessionState {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return init(questions.length, settings);
    const draft = JSON.parse(raw) as StoredQuizDraft;
    const ids = questions.map((question) => question.id);
    if (
      ![1, 2, 3].includes(draft.version) ||
      draft.state.status === 'finished' ||
      draft.state.total !== questions.length ||
      draft.questionIds.join('\n') !== ids.join('\n')
    ) {
      sessionStorage.removeItem(key);
      return init(questions.length, settings);
    }
    return {
      ...draft.state,
      settings: settingsFromDraft(draft.state as QuizSessionState & { policy?: 'standard' | 'strict' }),
      pausedAt: draft.state.pausedAt ?? null,
      focusInterruptions: draft.state.focusInterruptions ?? [],
    };
  } catch {
    sessionStorage.removeItem(key);
    return init(questions.length, settings);
  }
}

export function hasQuizDraft(quizId: string): boolean {
  try {
    const raw = sessionStorage.getItem(quizDraftKey(quizId));
    if (!raw) return false;
    const draft = JSON.parse(raw) as StoredQuizDraft;
    return draft.state.status === 'active' || draft.state.status === 'paused';
  } catch {
    return false;
  }
}

function reducer(state: QuizSessionState, action: QuizAction): QuizSessionState {
  switch (action.type) {
    case 'answer':
      if (state.status !== 'active') return state;
      return { ...state, answers: { ...state.answers, [action.questionId]: action.optionId } };
    case 'clear':
      if (state.status !== 'active') return state;
      return { ...state, answers: { ...state.answers, [action.questionId]: null } };
    case 'next':
      if (state.status !== 'active') return state;
      if (state.currentIndex >= state.total - 1) {
        return { ...state, status: 'finished', finishedAt: Date.now() };
      }
      return { ...state, currentIndex: state.currentIndex + 1 };
    case 'prev':
      if (state.status !== 'active') return state;
      return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };
    case 'goto':
      if (state.status !== 'active') return state;
      return {
        ...state,
        currentIndex: Math.min(Math.max(0, action.index), state.total - 1),
      };
    case 'finish':
      if (state.status === 'finished') return state;
      return { ...state, status: 'finished', finishedAt: Date.now() };
    case 'pause':
      if (state.status !== 'active' || !state.settings.allowPause) return state;
      return { ...state, status: 'paused', pausedAt: Date.now() };
    case 'resume':
      if (state.status !== 'paused' || state.pausedAt === null) return state;
      return {
        ...state,
        status: 'active',
        startedAt: state.startedAt + (Date.now() - state.pausedAt),
        pausedAt: null,
      };
    case 'recordFocusLoss':
      if (state.status !== 'active' || !state.settings.trackFocusLoss) return state;
      return {
        ...state,
        focusInterruptions: [...state.focusInterruptions, action.at],
      };
    case 'restart':
      return init(state.total, state.settings);
    default:
      return state;
  }
}

export interface QuizSummary {
  total: number;
  answered: number;
  correct: number;
  skipped: number;
  accuracy: number; // 0–100 over answered questions
  durationMs: number;
}

/** Derive the scoreboard from the current answers against the question set. */
export function summarize(
  questions: readonly PrelimsQuestion[],
  state: QuizSessionState,
): QuizSummary {
  let answered = 0;
  let correct = 0;
  for (const question of questions) {
    const picked = state.answers[question.id];
    if (picked == null) continue;
    answered += 1;
    if (picked === question.answer) correct += 1;
  }
  const end = state.finishedAt ?? state.pausedAt ?? Date.now();
  return {
    total: questions.length,
    answered,
    correct,
    skipped: questions.length - answered,
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    durationMs: Math.max(0, end - state.startedAt),
  };
}

/** Reducer-driven state machine for one timed quiz over a set of prelims. */
export function useQuizSession(
  questions: readonly PrelimsQuestion[],
  chapterId: string,
  settings: QuizSettings,
  questionSet: QuizQuestionSet,
) {
  const draftKey = quizDraftKey(chapterId);
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => restoreDraft(draftKey, questions, settings),
  );

  useEffect(() => {
    if (state.status === 'finished') {
      sessionStorage.removeItem(draftKey);
      return;
    }
    const draft: StoredQuizDraft = {
      version: 3,
      questionIds: questions.map((question) => question.id),
      questionSet,
      state,
    };
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draftKey, questionSet, questions, state]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (state.status !== 'active' || !state.settings.lockNavigation) return;
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.status, state.settings.lockNavigation]);

  const actions = useMemo(
    () => ({
      answer: (questionId: string, optionId: string) =>
        dispatch({ type: 'answer', questionId, optionId }),
      clear: (questionId: string) => dispatch({ type: 'clear', questionId }),
      next: () => dispatch({ type: 'next' }),
      prev: () => dispatch({ type: 'prev' }),
      goto: (index: number) => dispatch({ type: 'goto', index }),
      finish: () => dispatch({ type: 'finish' }),
      pause: () => dispatch({ type: 'pause' }),
      resume: () => dispatch({ type: 'resume' }),
      recordFocusLoss: () => dispatch({ type: 'recordFocusLoss', at: Date.now() }),
      restart: () => dispatch({ type: 'restart' }),
    }),
    [],
  );

  const current = questions[state.currentIndex];
  const summary = useCallback(() => summarize(questions, state), [questions, state]);

  return { state, current, actions, summary };
}
