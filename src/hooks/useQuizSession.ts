import { useCallback, useMemo, useReducer } from 'react';
import type { PrelimsQuestion, QuizAnswerMap } from '../types';

export interface QuizSessionState {
  status: 'active' | 'finished';
  total: number;
  currentIndex: number;
  answers: QuizAnswerMap;
  startedAt: number;
  finishedAt: number | null;
}

type QuizAction =
  | { type: 'answer'; questionId: string; optionId: string }
  | { type: 'clear'; questionId: string }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'finish' }
  | { type: 'restart' };

function init(total: number): QuizSessionState {
  return {
    status: 'active',
    total,
    currentIndex: 0,
    answers: {},
    startedAt: Date.now(),
    finishedAt: null,
  };
}

function reducer(state: QuizSessionState, action: QuizAction): QuizSessionState {
  switch (action.type) {
    case 'answer':
      if (state.status !== 'active') return state;
      return { ...state, answers: { ...state.answers, [action.questionId]: action.optionId } };
    case 'clear':
      return { ...state, answers: { ...state.answers, [action.questionId]: null } };
    case 'next':
      if (state.currentIndex >= state.total - 1) {
        return { ...state, status: 'finished', finishedAt: Date.now() };
      }
      return { ...state, currentIndex: state.currentIndex + 1 };
    case 'prev':
      return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };
    case 'goto':
      return {
        ...state,
        currentIndex: Math.min(Math.max(0, action.index), state.total - 1),
      };
    case 'finish':
      if (state.status === 'finished') return state;
      return { ...state, status: 'finished', finishedAt: Date.now() };
    case 'restart':
      return init(state.total);
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
  const end = state.finishedAt ?? Date.now();
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
export function useQuizSession(questions: readonly PrelimsQuestion[]) {
  const [state, dispatch] = useReducer(reducer, questions.length, init);

  const actions = useMemo(
    () => ({
      answer: (questionId: string, optionId: string) =>
        dispatch({ type: 'answer', questionId, optionId }),
      clear: (questionId: string) => dispatch({ type: 'clear', questionId }),
      next: () => dispatch({ type: 'next' }),
      prev: () => dispatch({ type: 'prev' }),
      goto: (index: number) => dispatch({ type: 'goto', index }),
      finish: () => dispatch({ type: 'finish' }),
      restart: () => dispatch({ type: 'restart' }),
    }),
    [],
  );

  const current = questions[state.currentIndex];
  const summary = useCallback(() => summarize(questions, state), [questions, state]);

  return { state, current, actions, summary };
}
