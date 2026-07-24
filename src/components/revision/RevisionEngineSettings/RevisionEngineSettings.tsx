import styles from './RevisionEngineSettings.module.css';

export interface RevisionEngineConfiguration {
  readonly questionLimit: number;
  readonly newQuestionPercent: number;
  readonly correctIntervals: readonly number[];
  readonly wrongReturnDays: number;
  readonly skippedReturnDays: number;
  readonly wrongLevelDrop: number;
  readonly skippedLevelDrop: number;
  readonly balanceSubjects: boolean;
  readonly prioritizeBookmarks: boolean;
  readonly sessionMode: 'standard' | 'strict';
  readonly fillCapacity: boolean;
}

interface RevisionEngineToggle {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: () => void;
}

interface RevisionEngineSettingsProps {
  scope: 'Daily' | 'Practice';
  value: RevisionEngineConfiguration;
  onChange: (next: RevisionEngineConfiguration) => void;
  onReset: () => void;
}

const STANDARD_INTERVALS = [1, 3, 7, 15, 30, 60, 120, 180] as const;

export function RevisionEngineSettings({ scope, value, onChange, onReset }: RevisionEngineSettingsProps) {
  const update = (patch: Partial<RevisionEngineConfiguration>) => onChange({ ...value, ...patch });

  return <details className={styles.customize} open>
    <summary><span><strong>Customize {scope} engine</strong><small>Capacity, new questions, intervals, mistakes and ordering</small></span><em>{scope} only</em></summary>
    <div className={styles.customBody}>
      <div className={styles.presetGrid}>
        <PresetButton title="Balanced" description="10 questions · optimal daily pace" active={value.questionLimit === 10 && value.wrongReturnDays === 1 && value.wrongLevelDrop === 2} onClick={() => update({ questionLimit: 10, newQuestionPercent: 100, fillCapacity: true, wrongReturnDays: 1, skippedReturnDays: 1, wrongLevelDrop: 2, skippedLevelDrop: 1, balanceSubjects: true, prioritizeBookmarks: true, correctIntervals: STANDARD_INTERVALS })} />
        <PresetButton title="Light" description="5 questions · gentle pace" active={value.questionLimit === 5} onClick={() => update({ questionLimit: 5, newQuestionPercent: 100, fillCapacity: true, wrongReturnDays: 2, skippedReturnDays: 2, correctIntervals: STANDARD_INTERVALS })} />
        <PresetButton title="Intensive" description="40 questions · faster return" active={value.questionLimit === 40} onClick={() => update({ questionLimit: 40, newQuestionPercent: 25, wrongReturnDays: 1, skippedReturnDays: 1, wrongLevelDrop: 3, skippedLevelDrop: 2, correctIntervals: [1, 2, 5, 10, 21, 45, 90, 150] })} />
        <PresetButton title="Exam sprint" description="75 questions · rapid cycles" active={value.questionLimit === 75} onClick={() => update({ questionLimit: 75, newQuestionPercent: 10, wrongReturnDays: 1, skippedReturnDays: 1, wrongLevelDrop: 3, skippedLevelDrop: 2, correctIntervals: [1, 2, 4, 7, 15, 30, 60, 90] })} />
      </div>
      <div className={styles.customFields}>
        <SelectSetting label={`${scope} capacity`} help={`The saved target for each ${scope.toLowerCase()} queue. Due questions come first; unseen questions fill remaining slots.`} value={value.questionLimit} options={[5, 10, 15, 20, 25, 30, 40, 50, 75, 100]} suffix="questions" onChange={(questionLimit) => update({ questionLimit })} />
        <SelectSetting label="Unseen allowance" help="The largest share of unused queue space that new questions may occupy. Due reviews always take priority." value={value.newQuestionPercent} options={[0, 10, 20, 25, 30, 40, 50, 75, 100]} suffix="%" onChange={(newQuestionPercent) => update({ newQuestionPercent })} />
        <SelectSetting label="Wrong returns after" help="A wrong answer becomes eligible again after this many days, regardless of its previous interval." value={value.wrongReturnDays} options={[1, 2, 3, 5, 7]} suffix="days" onChange={(wrongReturnDays) => update({ wrongReturnDays })} />
        <SelectSetting label="Skipped returns after" help="A skipped or unanswered question becomes eligible again after this many days." value={value.skippedReturnDays} options={[1, 2, 3, 5, 7]} suffix="days" onChange={(skippedReturnDays) => update({ skippedReturnDays })} />
        <SelectSetting label="Wrong progress penalty" help="How many successful-review stages a wrong answer loses. A larger drop makes later correct intervals shorter." value={value.wrongLevelDrop} options={[1, 2, 3, 4]} suffix="stages" onChange={(wrongLevelDrop) => update({ wrongLevelDrop })} />
        <SelectSetting label="Skipped progress penalty" help="How many successful-review stages a skipped answer loses. Zero keeps its current stage." value={value.skippedLevelDrop} options={[0, 1, 2, 3]} suffix="stages" onChange={(skippedLevelDrop) => update({ skippedLevelDrop })} />
      </div>
      <div className={styles.sessionPicker}>
        <div><strong>How should the {scope} session run?</strong><small>This choice is saved only for future {scope} queues.</small></div>
        <div>
          <button type="button" className={value.sessionMode === 'standard' ? styles.sessionActive : styles.sessionOption} aria-pressed={value.sessionMode === 'standard'} onClick={() => update({ sessionMode: 'standard' })}><span className={styles.modeTitle}><i />Standard session</span><strong>Flexible study</strong><span>Pause when needed · navigation stays protected · no focus-exit penalties</span></button>
          <button type="button" className={value.sessionMode === 'strict' ? styles.sessionActive : styles.sessionOption} aria-pressed={value.sessionMode === 'strict'} onClick={() => update({ sessionMode: 'strict' })}><span className={styles.modeTitle}><i />Strict exam conditions</span><strong>Focused test environment</strong><span>No pause · fullscreen · tab switching tracked · negative marking enabled</span></button>
        </div>
      </div>
      <div className={styles.intervalEditor}>
        <div><strong>Wait after consecutive correct reviews <InfoTip text="Each correct review advances the question one stage. These values decide how many days it stays hidden before becoming due again." /></strong><small>The question remains unavailable until its next due date.</small></div>
        <div>{value.correctIntervals.slice(1).map((days, index) => <label key={index}><span>After correct #{index + 1}</span><div><input aria-label={`${scope} days after correct review ${index + 1}`} type="number" min="1" max="365" value={days} onChange={(event) => { const correctIntervals = [...value.correctIntervals]; correctIntervals[index + 1] = Math.max(1, Number(event.target.value)); update({ correctIntervals }); }} /><em>days</em></div></label>)}</div>
      </div>
      <div className={styles.toggleList}>
        <ToggleSetting label={`Fill the saved ${scope.toLowerCase()} capacity`} description={`After due questions, use unseen questions from selected chapters until the ${scope.toLowerCase()} target is reached.`} checked={value.fillCapacity} onChange={() => update({ fillCapacity: !value.fillCapacity })} />
        <ToggleSetting label="Balance subjects" description="Rotate between subjects instead of allowing one subject to dominate." checked={value.balanceSubjects} onChange={() => update({ balanceSubjects: !value.balanceSubjects })} />
        <ToggleSetting label="Prioritise bookmarks" description="Move bookmarked questions higher when they become eligible." checked={value.prioritizeBookmarks} onChange={() => update({ prioritizeBookmarks: !value.prioritizeBookmarks })} />
      </div>
      <button type="button" className={styles.resetDefaults} onClick={onReset}>Reset {scope} engine defaults</button>
    </div>
  </details>;
}

function PresetButton({ title, description, active, onClick }: { title: string; description: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? styles.presetActive : styles.preset} onClick={onClick}><strong>{title}</strong><span>{description}</span></button>;
}

function SelectSetting({ label, help, value, options, suffix, onChange }: { label: string; help: string; value: number; options: readonly number[]; suffix: string; onChange: (value: number) => void }) {
  return <label><span>{label} <InfoTip text={help} /></span><select value={value} onChange={(event) => onChange(Number(event.target.value))}>{options.map((option) => <option key={option} value={option}>{option} {suffix}</option>)}</select></label>;
}

function InfoTip({ text }: { text: string }) {
  return <span className={styles.infoTip} tabIndex={0} aria-label={text}>?<span role="tooltip">{text}</span></span>;
}

function ToggleSetting({ label, description, checked, onChange }: RevisionEngineToggle) {
  return <button type="button" className={styles.toggleSetting} role="switch" aria-checked={checked} onClick={onChange}><span><strong>{label}</strong><small>{description}</small></span><span className={checked ? styles.switchOn : styles.switchOff}><span /></span></button>;
}
