import { useState } from 'react';
import {
  STANDARD_QUIZ_SETTINGS,
  STRICT_QUIZ_SETTINGS,
  type QuizSettings,
} from '../../../hooks/useQuizSession';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import styles from './QuizRunner.module.css';

interface QuizIntroProps {
  questionCount: number;
  lastScore?: { correct: number; total: number } | null;
  onStart: (settings: QuizSettings) => void;
}

const sameSettings = (left: QuizSettings, right: QuizSettings) =>
  left.allowPause === right.allowPause &&
  left.lockNavigation === right.lockNavigation &&
  left.trackFocusLoss === right.trackFocusLoss &&
  left.focusPenaltyEnabled === right.focusPenaltyEnabled &&
  left.focusLossGrace === right.focusLossGrace &&
  left.focusPenaltyPerLoss === right.focusPenaltyPerLoss;

export function QuizIntro({ questionCount, lastScore, onStart }: QuizIntroProps) {
  const [settings, setSettings] = useState<QuizSettings>(STANDARD_QUIZ_SETTINGS);
  const preset = sameSettings(settings, STRICT_QUIZ_SETTINGS)
    ? 'strict'
    : sameSettings(settings, STANDARD_QUIZ_SETTINGS)
      ? 'standard'
      : 'custom';

  const toggle = (key: 'allowPause' | 'lockNavigation' | 'trackFocusLoss' | 'focusPenaltyEnabled') =>
    setSettings((current) => ({ ...current, [key]: !current[key] }));

  const start = () => {
    if (settings.trackFocusLoss && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen can be denied by browser/device policy; the quiz still
        // starts with focus detection and navigation guards enabled.
      });
    }
    onStart(settings);
  };

  return (
    <div className={styles.intro}>
      <span className={styles.introMark}><Icon name="sparkle" size={22} /></span>
      <h2 className={styles.introTitle}>Quiz mode</h2>
      <p className={styles.introText}>
        {questionCount} prelims {questionCount === 1 ? 'question' : 'questions'}.
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

      <div className={styles.quizToggles}>
        <ToggleRow label="Allow timer pause" description="Freeze the timer and question controls while paused." checked={settings.allowPause} onChange={() => toggle('allowPause')} />
        <ToggleRow label="Lock internal navigation" description="Prevent opening Library, Search, Settings, or Learning while running." checked={settings.lockNavigation} onChange={() => toggle('lockNavigation')} />
        <ToggleRow label="Track focus changes" description="Start fullscreen, deter common exit shortcuts, and record tab or app switching." checked={settings.trackFocusLoss} onChange={() => toggle('trackFocusLoss')} />
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
                <select
                  value={settings.focusLossGrace}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    focusLossGrace: Number(event.target.value),
                  }))}
                >
                  {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Deduction per extra exit</span>
                <select
                  value={settings.focusPenaltyPerLoss}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    focusPenaltyPerLoss: Number(event.target.value),
                  }))}
                >
                  {[0.25, 0.5, 1, 1.25].map((value) => <option key={value} value={value}>−{value} mark{value === 1 ? '' : 's'}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {preset === 'custom' && <p className={styles.customLabel}>Custom configuration</p>}
      {lastScore && <p className={styles.introLast}>Last attempt · {lastScore.correct}/{lastScore.total} correct</p>}

      <Button variant="primary" size="lg" onClick={start}>
        Start quiz
      </Button>
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
