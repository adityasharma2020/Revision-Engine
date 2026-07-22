import { useEffect } from 'react';
import type { QuizSettings } from '../../../types';
import { Button } from '../../common';
import { QuizAdvancedControls, QuizPresetPicker, QuizTimingSettings } from '../QuizRunner/QuizSessionControls';
import { getQuizPreset } from '../QuizRunner/quizSessionControlUtils';
import styles from './QuizLaunchDialog.module.css';

export function QuizLaunchDialog({ title, description, settings, questionCount, settingsLocked = false, confirmLabel, onSettingsChange, onCancel, onConfirm }: {
  title: string;
  description: string;
  settings: QuizSettings;
  questionCount: number;
  settingsLocked?: boolean;
  confirmLabel: string;
  onSettingsChange: (settings: QuizSettings) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const preset = getQuizPreset(settings);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onCancel]);

  return (
    <div className={styles.backdrop} onMouseDown={onCancel}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="quiz-launch-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Quick setup</span><h2 id="quiz-launch-title">{title}</h2><p>{description}</p></div>
          <button type="button" onClick={onCancel} aria-label="Close quick setup">×</button>
        </header>
        <div className={styles.controls}>
          <QuizPresetPicker settings={settings} onChange={onSettingsChange} disabled={settingsLocked} />
          <details className={styles.optional}>
            <summary><span><strong>Optional settings</strong><small>Timer, navigation and focus controls</small></span>{preset === 'custom' && <em>Custom</em>}</summary>
            <div>
              <QuizTimingSettings settings={settings} questionCount={questionCount} onChange={onSettingsChange} disabled={settingsLocked} />
              <QuizAdvancedControls settings={settings} onChange={onSettingsChange} disabled={settingsLocked} />
            </div>
          </details>
        </div>
        <footer><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button></footer>
      </section>
    </div>
  );
}
