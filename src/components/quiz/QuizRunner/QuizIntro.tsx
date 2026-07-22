import { useMemo, useState } from 'react';
import type { PrelimsQuestion, QuizQuestionSet, QuizQuestionSetType, QuizResultList } from '../../../types';
import {
  STANDARD_QUIZ_SETTINGS,
  STRICT_QUIZ_SETTINGS,
  type QuizSettings,
} from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { questionAttemptStats } from '../../../utils/questionStats';
import { QuestionSelectorModal } from './QuestionSelectorModal';
import styles from './QuizRunner.module.css';

interface QuizIntroProps {
  chapterId: string;
  questions: readonly PrelimsQuestion[];
  results: QuizResultList;
  lastScore?: { correct: number; total: number } | null;
  onStart: (settings: QuizSettings, questionSet: QuizQuestionSet) => void;
}

const sameSettings = (left: QuizSettings, right: QuizSettings) =>
  left.allowPause === right.allowPause &&
  left.lockNavigation === right.lockNavigation &&
  left.trackFocusLoss === right.trackFocusLoss &&
  left.allowQuit === right.allowQuit &&
  left.focusPenaltyEnabled === right.focusPenaltyEnabled &&
  left.focusLossGrace === right.focusLossGrace &&
  left.focusPenaltyPerLoss === right.focusPenaltyPerLoss;

export function QuizIntro({ chapterId, questions, results, lastScore, onStart }: QuizIntroProps) {
  const [settings, setSettings] = useState<QuizSettings>(STANDARD_QUIZ_SETTINGS);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [questionSet, setQuestionSet] = useState<QuizQuestionSet>(() => ({
    type: 'full',
    label: 'All questions',
    questionIds: questions.map((question) => question.id),
    sourceQuestionCount: questions.length,
  }));
  const stats = useMemo(() => questionAttemptStats(results, chapterId), [results, chapterId]);
  const lastResult = useMemo(() => results
    .filter((result) => result.chapterId === chapterId && result.perQuestion?.length)
    .sort((a, b) => b.takenAt - a.takenAt)[0], [results, chapterId]);
  const lastOutcomes = useMemo(() => new Map(
    lastResult?.perQuestion?.map((item) => [item.questionId, item.correct] as const) ?? [],
  ), [lastResult]);
  const eligible = new Set(questions.map((question) => question.id));
  const sets: Array<{ type: QuizQuestionSetType; label: string; ids: string[] }> = [
    { type: 'full', label: 'All questions', ids: questions.map((question) => question.id) },
    { type: 'correct-last', label: 'Correct last time', ids: [...lastOutcomes].filter(([, outcome]) => outcome === true).map(([id]) => id).filter((id) => eligible.has(id)) },
    { type: 'incorrect-last', label: 'Wrong last time', ids: [...lastOutcomes].filter(([, outcome]) => outcome === false).map(([id]) => id).filter((id) => eligible.has(id)) },
    { type: 'skipped-last', label: 'Skipped last time', ids: [...lastOutcomes].filter(([, outcome]) => outcome === null).map(([id]) => id).filter((id) => eligible.has(id)) },
  ];
  const preset = sameSettings(settings, STRICT_QUIZ_SETTINGS)
    ? 'strict'
    : sameSettings(settings, STANDARD_QUIZ_SETTINGS)
      ? 'standard'
      : 'custom';

  const toggle = (key: 'allowPause' | 'allowQuit' | 'lockNavigation' | 'trackFocusLoss' | 'focusPenaltyEnabled') =>
    setSettings((current) => ({ ...current, [key]: !current[key] }));

  const start = () => {
    if (settings.trackFocusLoss && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen can be denied by browser/device policy; the quiz still
        // starts with focus detection and navigation guards enabled.
      });
    }
    onStart(settings, questionSet);
  };

  return (
    <div className={styles.intro}>
      <span className={styles.introMark}><Icon name="sparkle" size={22} /></span>
      <h2 className={styles.introTitle}>Quiz mode</h2>
      <p className={styles.introText}>
        {questionSet.type === 'full'
          ? `${questions.length} prelims ${questions.length === 1 ? 'question' : 'questions'}.`
          : `${questionSet.questionIds.length} of ${questions.length} questions selected.`}
        Answers stay hidden until submission.
      </p>

      <div className={styles.policyPicker} aria-label="Quiz presets">
        <button
          type="button"
          className={preset === 'standard' ? styles.policyActive : styles.policyOption}
          onClick={() => setSettings(STANDARD_QUIZ_SETTINGS)}
        >
          <strong>Standard preset</strong>
          <span>Pause enabled, navigation locked while the timer runs.</span>
        </button>
        <button
          type="button"
          className={preset === 'strict' ? styles.policyActive : styles.policyOption}
          onClick={() => setSettings(STRICT_QUIZ_SETTINGS)}
        >
          <strong>Strict preset</strong>
          <span>Fullscreen, no pause, navigation locked, focus changes recorded.</span>
        </button>
      </div>

      <details className={styles.quizAdvanced}>
        <summary>
          <span><strong>Customize quiz</strong><small>Questions, navigation, pause, and focus controls</small></span>
          <em>{questionSet.type !== 'full'
            ? `${questionSet.questionIds.length} selected`
            : preset === 'custom' ? 'Custom settings' : 'Optional'}</em>
        </summary>
        <div className={styles.quizAdvancedBody}>
          <section className={styles.questionSetPanel} aria-labelledby="question-set-title">
            <div className={styles.questionSetHead}>
              <div><h3 id="question-set-title">Question selection</h3><p>Repeat an outcome from your last quiz or choose questions manually.</p></div>
              <strong>{questionSet.questionIds.length}/{questions.length}</strong>
            </div>
            <div className={styles.questionSetPresets}>
              {sets.map((set) => (
                <button
                  key={set.type}
                  type="button"
                  disabled={set.ids.length === 0}
                  className={questionSet.type === set.type ? styles.questionSetActive : styles.questionSetOption}
                  onClick={() => setQuestionSet({ type: set.type, label: set.label, questionIds: set.ids, sourceQuestionCount: questions.length })}
                >
                  <span>{set.label}</span><b>{set.ids.length}</b>
                </button>
              ))}
              <button type="button" className={styles.chooseQuestionsButton} onClick={() => setSelectorOpen(true)}>
                <Icon name="settings" size={14} /> Choose individual
              </button>
            </div>
          </section>

          <div className={styles.quizToggles}>
            <ToggleRow label="Allow timer pause" description="Freeze the timer and controls while paused." checked={settings.allowPause} onChange={() => toggle('allowPause')} />
            <ToggleRow label="Lock navigation" description="Prevent leaving the quiz while its timer runs." checked={settings.lockNavigation} onChange={() => toggle('lockNavigation')} />
            <ToggleRow label="Allow unfinished quit" description="Permit discarding an unfinished attempt." checked={settings.allowQuit} onChange={() => toggle('allowQuit')} />
            <ToggleRow label="Track focus changes" description="Record tab, window, or app switching." checked={settings.trackFocusLoss} onChange={() => toggle('trackFocusLoss')} />
          </div>

          {settings.trackFocusLoss && (
            <div className={styles.penaltyPolicy}>
              <ToggleRow
                label="Negative marking for focus exits"
                description="After the warning allowance, deduct marks for every additional interruption."
                checked={settings.focusPenaltyEnabled}
                onChange={() => toggle('focusPenaltyEnabled')}
              />
              {settings.focusPenaltyEnabled && (
                <div className={styles.penaltyFields}>
                  <label>
                    <span>Warnings allowed</span>
                    <select value={settings.focusLossGrace} onChange={(event) => setSettings((current) => ({ ...current, focusLossGrace: Number(event.target.value) }))}>
                      {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Deduction per extra exit</span>
                    <select value={settings.focusPenaltyPerLoss} onChange={(event) => setSettings((current) => ({ ...current, focusPenaltyPerLoss: Number(event.target.value) }))}>
                      {[0.25, 0.5, 1, 1.25].map((value) => <option key={value} value={value}>−{value} mark{value === 1 ? '' : 's'}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      {lastScore && <p className={styles.introLast}>Last attempt · {lastScore.correct}/{lastScore.total} correct</p>}

      <Button variant="primary" size="lg" onClick={start}>
        Start {questionSet.type === 'full' ? 'full quiz' : 'targeted quiz'}
      </Button>
      {selectorOpen && (
        <QuestionSelectorModal
          questions={questions}
          stats={stats}
          initialIds={questionSet.questionIds}
          onClose={() => setSelectorOpen(false)}
          onApply={(questionIds) => {
            setQuestionSet({ type: 'custom', label: 'Custom selection', questionIds, sourceQuestionCount: questions.length });
            setSelectorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button type="button" className={styles.toggleRow} role="switch" aria-checked={checked} onClick={onChange}>
      <span><strong>{label}</strong><small>{description}</small></span>
      <span className={checked ? styles.switchOn : styles.switchOff} aria-hidden="true"><span /></span>
    </button>
  );
}
