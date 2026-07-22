import { useEffect, useMemo, useState } from 'react';
import type { PrelimsQuestion } from '../../../types';
import type { QuestionAttemptStats } from '../../../utils/questionStats';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import styles from './QuizRunner.module.css';

type SelectorFilter = 'all' | 'correct' | 'incorrect' | 'skipped';

interface QuestionSelectorModalProps {
  questions: readonly PrelimsQuestion[];
  stats: ReadonlyMap<string, QuestionAttemptStats>;
  initialIds: readonly string[];
  onApply: (ids: readonly string[]) => void;
  onClose: () => void;
}

export function QuestionSelectorModal({
  questions,
  stats,
  initialIds,
  onApply,
  onClose,
}: QuestionSelectorModalProps) {
  const [selected, setSelected] = useState(() => new Set(initialIds));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SelectorFilter>('all');

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return questions.filter((question) => {
      const history = stats.get(question.id);
      if (filter !== 'all' && history?.lastOutcome !== filter) return false;
      return !needle || `${question.statement} ${question.tags?.join(' ') ?? ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [filter, query, questions, stats]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className={styles.selectorOverlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.selectorDialog} role="dialog" aria-modal="true" aria-labelledby="question-selector-title">
        <header className={styles.selectorHead}>
          <div>
            <span>Advanced selection</span>
            <h2 id="question-selector-title">Choose questions</h2>
            <p>Build a focused quiz using your saved attempt history.</p>
          </div>
          <button type="button" className={styles.selectorClose} onClick={onClose} aria-label="Close question selector">
            <Icon name="close" size={19} />
          </button>
        </header>

        <div className={styles.selectorTools}>
          <div className={styles.selectorSearch}>
            <Icon name="search" size={16} />
            <input aria-label="Search questions or tags" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions or tags" autoFocus />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <div className={styles.selectorControlRow}>
            <div className={styles.selectorFilters} aria-label="Filter questions">
              <span>Show</span>
              {(['all', 'correct', 'incorrect', 'skipped'] as const).map((value) => (
                <button key={value} type="button" className={filter === value ? styles.selectorFilterActive : styles.selectorFilter} onClick={() => setFilter(value)}>
                  {value === 'all' ? 'All' : value === 'incorrect' ? 'Wrong last' : `${value[0].toUpperCase()}${value.slice(1)} last`}
                </button>
              ))}
            </div>
            <div className={styles.selectorBulkActions}>
              <button type="button" onClick={() => setSelected((current) => new Set([...current, ...visible.map((question) => question.id)]))}>Select visible</button>
              <button type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear selection</button>
            </div>
          </div>
        </div>

        <ol className={styles.selectorList}>
          {visible.map((question) => {
            const history = stats.get(question.id);
            const checked = selected.has(question.id);
            return (
              <li key={question.id}>
                <button type="button" className={checked ? styles.selectorQuestionActive : styles.selectorQuestion} onClick={() => toggle(question.id)} aria-pressed={checked}>
                  <span className={checked ? styles.selectorCheckActive : styles.selectorCheck} aria-hidden="true">
                    {checked && <Icon name="check" size={14} />}
                  </span>
                  <span className={styles.selectorQuestionMain}>
                    <span className={styles.selectorQuestionText}><b>{questions.indexOf(question) + 1}</b>{question.statement}</span>
                    <span className={styles.selectorQuestionStats}>
                      {history ? (
                        <>
                          <span>{history.attempts} attempt{history.attempts === 1 ? '' : 's'}</span>
                          <span className={styles.statCorrect}>{history.correct} correct</span>
                          <span className={styles.statIncorrect}>{history.incorrect} wrong</span>
                          <span>{history.skipped} skipped</span>
                          {history.lastOutcome && <em>Last: {history.lastOutcome}</em>}
                        </>
                      ) : <em>Not attempted yet</em>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className={styles.selectorEmpty}>
              <span><Icon name="search" size={20} /></span>
              <strong>No matching questions</strong>
              <p>Try another search or show all question outcomes.</p>
              <button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>Reset search and filters</button>
            </li>
          )}
        </ol>

        <footer className={styles.selectorFooter}>
          <div><strong>{selected.size} selected</strong><span>of {questions.length} available</span></div>
          <div>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={selected.size === 0} onClick={() => onApply(questions.filter((question) => selected.has(question.id)).map((question) => question.id))}>
              Use selection
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
