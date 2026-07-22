import { useMemo } from 'react';
import { subjectStyle } from '../../../constants/subjects';
import { cx } from '../../../utils/cx';
import styles from './ScopeFilter.module.css';

export interface ScopeChapter {
  id: string;
  title: string;
  subject: string;
}

interface ScopeFilterProps {
  chapters: ScopeChapter[];
  /** Empty set = all chapters. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * Flexible analytics scope: everything, a subject, or any combination of
 * chapters. Quick chips set common scopes; chapter chips fine-tune (multi-select
 * across subjects). Empty selection means "all".
 */
export function ScopeFilter({ chapters, selected, onChange }: ScopeFilterProps) {
  const subjects = useMemo(
    () => [...new Set(chapters.map((c) => c.subject))].sort(),
    [chapters],
  );

  const isAll = selected.size === 0;
  const selectSubject = (subject: string) =>
    onChange(new Set(chapters.filter((c) => c.subject === subject).map((c) => c.id)));

  const toggleChapter = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const subjectActive = (subject: string) => {
    const ids = chapters.filter((c) => c.subject === subject).map((c) => c.id);
    return ids.length > 0 && ids.every((id) => selected.has(id)) && selected.size === ids.length;
  };

  return (
    <div className={styles.filter}>
      <div className={styles.quick}>
        <button
          type="button"
          className={cx(styles.chip, isAll && styles.active)}
          onClick={() => onChange(new Set())}
        >
          All
        </button>
        {subjects.map((subject) => (
          <button
            key={subject}
            type="button"
            className={cx(styles.chip, subjectActive(subject) && styles.active)}
            onClick={() => selectSubject(subject)}
          >
            <span
              className={styles.dot}
              style={{ backgroundColor: `hsl(${subjectStyle(subject).hue} 60% 55%)` }}
            />
            {subjectStyle(subject).label}
          </button>
        ))}
      </div>

      {chapters.length > 1 && (
        <div className={styles.chapters}>
          {chapters.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cx(styles.chapterChip, selected.has(c.id) && styles.chapterActive)}
              onClick={() => toggleChapter(c.id)}
              title={c.title}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
