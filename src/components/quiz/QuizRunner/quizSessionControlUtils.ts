import type { QuizSettings } from '../../../types';
import { STANDARD_QUIZ_SETTINGS, STRICT_QUIZ_SETTINGS } from '../../../hooks/useQuizSession';

export type QuizPreset = 'standard' | 'strict' | 'custom';

const sameQuizSettings = (left: QuizSettings, right: QuizSettings) =>
  left.allowPause === right.allowPause && left.lockNavigation === right.lockNavigation &&
  left.trackFocusLoss === right.trackFocusLoss && left.allowQuit === right.allowQuit &&
  left.focusPenaltyEnabled === right.focusPenaltyEnabled && left.focusLossGrace === right.focusLossGrace &&
  left.focusPenaltyPerLoss === right.focusPenaltyPerLoss && left.timeLimitEnabled === right.timeLimitEnabled &&
  left.secondsPerQuestion === right.secondsPerQuestion && left.autoSubmitOnTimeEnd === right.autoSubmitOnTimeEnd;

export function getQuizPreset(settings: QuizSettings): QuizPreset {
  if (sameQuizSettings(settings, STRICT_QUIZ_SETTINGS)) return 'strict';
  if (sameQuizSettings(settings, STANDARD_QUIZ_SETTINGS)) return 'standard';
  return 'custom';
}
