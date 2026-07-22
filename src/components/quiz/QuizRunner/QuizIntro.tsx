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
  left.trackFocusLoss === right.trackFocusLoss;

export function QuizIntro({ questionCount, lastScore, onStart }: QuizIntroProps) {
  const [settings, setSettings] = useState<QuizSettings>(STANDARD_QUIZ_SETTINGS);
  const preset = sameSettings(settings, STRICT_QUIZ_SETTINGS)
    ? 'strict'
    : sameSettings(settings, STANDARD_QUIZ_SETTINGS)
      ? 'standard'
      : 'custom';

  const toggle = (key: keyof QuizSettings) =>
    setSettings((current) => ({ ...current, [key]: !current[key] }));

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
          <span>No pause, navigation locked, focus changes tracked.</span>
        </button>
      </div>

      <div className={styles.quizToggles}>
        <ToggleRow label="Allow timer pause" description="Freeze the timer and question controls while paused." checked={settings.allowPause} onChange={() => toggle('allowPause')} />
        <ToggleRow label="Lock internal navigation" description="Prevent opening Library, Search, Settings, or Learning while running." checked={settings.lockNavigation} onChange={() => toggle('lockNavigation')} />
        <ToggleRow label="Track focus changes" description="Show a notice if another browser tab or app interrupts focus." checked={settings.trackFocusLoss} onChange={() => toggle('trackFocusLoss')} />
      </div>

      {preset === 'custom' && <p className={styles.customLabel}>Custom configuration</p>}
      {lastScore && <p className={styles.introLast}>Last attempt · {lastScore.correct}/{lastScore.total} correct</p>}

      <Button variant="primary" size="lg" onClick={() => onStart(settings)}>
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
