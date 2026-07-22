import { useCallback } from 'react';
import { STANDARD_QUIZ_SETTINGS } from './useQuizSession';
import type { QuizSettings } from '../types';

/** Fresh Standard defaults. Launch choices are deliberately not persisted. */
export function useSavedQuizSettings() {
  const save = useCallback((_next: QuizSettings) => undefined, []);

  return { settings: STANDARD_QUIZ_SETTINGS, save };
}
