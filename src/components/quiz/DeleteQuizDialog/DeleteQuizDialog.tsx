import { useEffect, useState } from 'react';
import type { QuizResult } from '../../../types';
import { useUserData } from '../../../context/UserDataContext';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import styles from './DeleteQuizDialog.module.css';

export function DeleteQuizDialog({ result, onClose, onDeleted }: {
  result: QuizResult;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { deleteQuizResult } = useUserData();
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="delete-quiz-title" className={styles.dialog} onMouseDown={(event) => event.stopPropagation()}>
        <span className={styles.icon}><Icon name="trash" size={22} /></span>
        <h2 id="delete-quiz-title">Delete this quiz attempt?</h2>
        <p>This removes it from history, revision recommendations, progress totals and every analytics calculation. The synced tombstone is retained for data integrity.</p>
        <div className={styles.attempt}><strong>{result.chapterTitle ?? 'Quiz attempt'}</strong><span>{result.correct}/{result.totalQuestions} correct · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(result.takenAt)}</span></div>
        <label><span>Type <strong>DELETE</strong> to confirm</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} /></label>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>Keep attempt</Button>
          <Button variant="danger" disabled={confirmation !== 'DELETE'} onClick={() => {
            deleteQuizResult(result.id);
            onDeleted();
          }}><Icon name="trash" size={15} />Delete permanently from progress</Button>
        </div>
      </section>
    </div>
  );
}
