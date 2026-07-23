import { useEffect, useMemo, useState } from 'react';
import type { PrelimsQuestion, QuizQuestionSet, QuizQuestionSetType, QuizResultList } from '../../../types';
import type { QuestionOriginKind } from '../../../utils/questionOrigin';
import type { QuizSettings } from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { questionAttemptStats } from '../../../utils/questionStats';
import { QuestionSelectorModal } from './QuestionSelectorModal';
import styles from './QuizRunner.module.css';
import { useSavedQuizSettings } from '../../../hooks/useSavedQuizSettings';
import { QuizAdvancedControls, QuizPresetPicker, QuizTimingSettings } from './QuizSessionControls';
import { getQuizPreset } from './quizSessionControlUtils';

interface QuizIntroProps {
  chapterId: string;
  questions: readonly PrelimsQuestion[];
  origin: 'all' | QuestionOriginKind;
  availableOrigins: ReadonlySet<QuestionOriginKind>;
  onOrigin?: (origin: 'all' | QuestionOriginKind) => void;
  results: QuizResultList;
  lastScore?: { correct: number; total: number } | null;
  onStart: (settings: QuizSettings, questionSet: QuizQuestionSet, testRun?: boolean) => void;
}

export function QuizIntro({ chapterId, questions, origin, availableOrigins, onOrigin, results, lastScore, onStart }: QuizIntroProps) {
  const { settings: savedSettings, save: saveSettings } = useSavedQuizSettings();
  const [settings, setSettings] = useState<QuizSettings>(savedSettings);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [questionSet, setQuestionSet] = useState<QuizQuestionSet>(() => ({
    type: 'full',
    label: 'All questions',
    questionIds: questions.map((question) => question.id),
    sourceQuestionCount: questions.length,
  }));

  useEffect(() => {
    setQuestionSet({
      type: 'full',
      label: 'All questions',
      questionIds: questions.map((question) => question.id),
      sourceQuestionCount: questions.length,
    });
  }, [questions]);
  useEffect(() => setSettings(savedSettings), [savedSettings]);
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
  const preset = getQuizPreset(settings);

  const start = (testRun = false) => {
    if (settings.trackFocusLoss && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen can be denied by browser/device policy; the quiz still
        // starts with focus detection and navigation guards enabled.
      });
    }
    const normalized = { ...settings, secondsPerQuestion: Math.max(1, Math.round(settings.secondsPerQuestion)) };
    if (!testRun) saveSettings(normalized);
    onStart(normalized, questionSet, testRun);
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

      <QuizPresetPicker settings={settings} onChange={setSettings} />

      <details className={styles.quizAdvanced}>
        <summary>
          <span><strong>Customize quiz</strong><small>Questions, navigation, pause, and focus controls</small></span>
          <em>{questionSet.type !== 'full'
            ? `${questionSet.questionIds.length} selected`
            : preset === 'custom' ? 'Custom settings' : 'Optional'}</em>
        </summary>
        <div className={styles.quizAdvancedBody}>
          {availableOrigins.size > 0 && onOrigin && (
            <section className={styles.quizSourcePanel} aria-labelledby="quiz-source-title">
              <div>
                <h3 id="quiz-source-title">Question source</h3>
                <p>All sources are included by default.</p>
              </div>
              <div className={styles.quizSourceOptions}>
                {(['all', 'fyq', 'pyq', 'other'] as const).map((value) =>
                  value === 'all' || availableOrigins.has(value) ? (
                    <button
                      key={value}
                      type="button"
                      className={origin === value ? styles.quizSourceActive : styles.quizSourceOption}
                      aria-pressed={origin === value}
                      onClick={() => onOrigin(value)}
                    >
                      {value === 'all' ? 'All' : value.toUpperCase()}
                    </button>
                  ) : null,
                )}
              </div>
            </section>
          )}
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

          <QuizTimingSettings settings={settings} questionCount={questionSet.questionIds.length} onChange={setSettings} />

          <QuizAdvancedControls settings={settings} onChange={setSettings} />
        </div>
      </details>

      {lastScore && <p className={styles.introLast}>Last attempt · {lastScore.correct}/{lastScore.total} correct</p>}

      <Button variant="primary" size="lg" onClick={() => start(false)}>
        Start {questionSet.type === 'full' ? 'full quiz' : 'targeted quiz'}
      </Button>
      <button type="button" className={styles.testRunLaunch} onClick={() => start(true)}>
        <Icon name="monitor" size={14} />
        Test run <span>Not saved</span>
      </button>
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
