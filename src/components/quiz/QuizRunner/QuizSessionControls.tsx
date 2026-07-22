import type { QuizSettings } from '../../../types';
import { STANDARD_QUIZ_SETTINGS, STRICT_QUIZ_SETTINGS } from '../../../hooks/useQuizSession';
import styles from './QuizRunner.module.css';
import { getQuizPreset } from './quizSessionControlUtils';

export function QuizPresetPicker({ settings, onChange, disabled = false }: {
  settings: QuizSettings;
  onChange: (settings: QuizSettings) => void;
  disabled?: boolean;
}) {
  const preset = getQuizPreset(settings);
  const choose = (next: QuizSettings) => onChange({ ...next });
  return (
    <div className={`${styles.policyPicker} ${disabled ? styles.sessionControlsDisabled : ''}`} aria-label="Quiz presets">
      <button type="button" disabled={disabled} className={preset === 'standard' ? styles.policyActive : styles.policyOption} onClick={() => choose(STANDARD_QUIZ_SETTINGS)}>
        <strong>Standard preset</strong><span>Pause and unfinished quit enabled. No focus penalties.</span>
      </button>
      <button type="button" disabled={disabled} className={preset === 'strict' ? styles.policyActive : styles.policyOption} onClick={() => choose(STRICT_QUIZ_SETTINGS)}>
        <strong>Strict preset</strong><span>Fullscreen, no pause, focus tracking and negative marking.</span>
      </button>
    </div>
  );
}

export function QuizTimingSettings({ settings, questionCount, onChange, disabled = false }: {
  settings: QuizSettings;
  questionCount: number;
  onChange: (settings: QuizSettings) => void;
  disabled?: boolean;
}) {
  const count = Math.max(1, questionCount);
  return (
    <section className={`${styles.timeLimitPanel} ${disabled ? styles.sessionControlsDisabled : ''}`} aria-labelledby="time-limit-title">
      <QuizToggleRow disabled={disabled} label="Finish within a time limit" description="Run this quiz at an exam-like pace." checked={settings.timeLimitEnabled} onChange={() => onChange({ ...settings, timeLimitEnabled: !settings.timeLimitEnabled })} />
      {settings.timeLimitEnabled && <>
        <div className={styles.timeLimitFields}>
          <label><span id="time-limit-title">Total quiz time</span><div><input disabled={disabled} type="number" min="1" max="600" step="1" value={Math.max(1, Math.round((settings.secondsPerQuestion * count) / 60))} onChange={(event) => { const minutes = Math.max(1, Math.min(600, Number(event.target.value) || 1)); onChange({ ...settings, secondsPerQuestion: (minutes * 60) / count }); }} /><em>minutes</em></div></label>
          <p><strong>Prelims suggestion:</strong> 72 seconds × {questionCount} questions = {Math.ceil((72 * questionCount) / 60)} minutes. You can override it.</p>
        </div>
        <QuizToggleRow disabled={disabled} label="Submit when time ends" description="Unanswered questions are recorded as skipped." checked={settings.autoSubmitOnTimeEnd} onChange={() => onChange({ ...settings, autoSubmitOnTimeEnd: !settings.autoSubmitOnTimeEnd })} />
      </>}
    </section>
  );
}

export function QuizAdvancedControls({ settings, onChange, disabled = false }: {
  settings: QuizSettings;
  onChange: (settings: QuizSettings) => void;
  disabled?: boolean;
}) {
  return <>
    <div className={`${styles.quizToggles} ${disabled ? styles.sessionControlsDisabled : ''}`}>
      <QuizToggleRow disabled={disabled} label="Allow timer pause" description="Freeze the timer and controls while paused." checked={settings.allowPause} onChange={() => onChange({ ...settings, allowPause: !settings.allowPause })} />
      <QuizToggleRow disabled={disabled} label="Lock navigation" description="Prevent leaving the quiz while its timer runs." checked={settings.lockNavigation} onChange={() => onChange({ ...settings, lockNavigation: !settings.lockNavigation })} />
      <QuizToggleRow disabled={disabled} label="Allow unfinished quit" description="Permit discarding an unfinished attempt." checked={settings.allowQuit} onChange={() => onChange({ ...settings, allowQuit: !settings.allowQuit })} />
      <QuizToggleRow disabled={disabled} label="Track focus changes" description="Record tab, window, or app switching." checked={settings.trackFocusLoss} onChange={() => onChange({ ...settings, trackFocusLoss: !settings.trackFocusLoss })} />
    </div>
    {settings.trackFocusLoss && <div className={`${styles.penaltyPolicy} ${disabled ? styles.sessionControlsDisabled : ''}`}>
      <QuizToggleRow disabled={disabled} label="Negative marking for focus exits" description="After the warning allowance, deduct marks for every additional interruption." checked={settings.focusPenaltyEnabled} onChange={() => onChange({ ...settings, focusPenaltyEnabled: !settings.focusPenaltyEnabled })} />
      {settings.focusPenaltyEnabled && <div className={styles.penaltyFields}>
        <label><span>Warnings allowed</span><select disabled={disabled} value={settings.focusLossGrace} onChange={(event) => onChange({ ...settings, focusLossGrace: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Deduction per extra exit</span><select disabled={disabled} value={settings.focusPenaltyPerLoss} onChange={(event) => onChange({ ...settings, focusPenaltyPerLoss: Number(event.target.value) })}>{[0.25, 0.5, 1, 1.25].map((value) => <option key={value} value={value}>−{value} mark{value === 1 ? '' : 's'}</option>)}</select></label>
      </div>}
    </div>}
  </>;
}

export function QuizToggleRow({ label, description, checked, onChange, disabled = false }: {
  label: string; description: string; checked: boolean; onChange: () => void; disabled?: boolean;
}) {
  return <button disabled={disabled} type="button" className={styles.toggleRow} role="switch" aria-checked={checked} onClick={onChange}><span><strong>{label}</strong><small>{description}</small></span><span className={checked ? styles.switchOn : styles.switchOff} aria-hidden="true"><span /></span></button>;
}
