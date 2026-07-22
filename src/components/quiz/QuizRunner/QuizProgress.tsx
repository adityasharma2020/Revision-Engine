import { Icon } from '../../common/Icon';
import { formatDuration } from '../../../utils/time';
import styles from './QuizRunner.module.css';

interface QuizProgressProps {
  current: number; // 1-based
  total: number;
  answered: number;
  elapsedMs: number;
  remainingMs?: number;
  urgent?: boolean;
}

/** Sticky header while a quiz is active: position, live timer, progress bar. */
export function QuizProgress({ current, total, answered, elapsedMs, remainingMs, urgent = false }: QuizProgressProps) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className={styles.progress}>
      <div className={styles.progressTop}>
        <span className={styles.progressCount}>
          Question <strong>{current}</strong> / {total}
        </span>
        <span className={urgent ? styles.timerUrgent : styles.timer} aria-live={urgent ? 'polite' : 'off'}>
          <Icon name="clock" size={15} />
          <span className={styles.timerValue}>{remainingMs === undefined ? formatDuration(elapsedMs) : formatDuration(remainingMs)}</span>
          <small>{remainingMs === undefined ? 'elapsed' : 'remaining'}</small>
        </span>
      </div>
      <div className={styles.progressBar} role="progressbar" aria-valuenow={pct}>
        <span className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.progressAnswered}>{answered} answered</span>
    </div>
  );
}
