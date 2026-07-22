import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import styles from './QuizRunner.module.css';

interface QuizIntroProps {
  questionCount: number;
  lastScore?: { correct: number; total: number } | null;
  onStart: () => void;
}

/** Pre-quiz screen: sets expectations, then starts the timer on demand. */
export function QuizIntro({ questionCount, lastScore, onStart }: QuizIntroProps) {
  return (
    <div className={styles.intro}>
      <span className={styles.introMark}>
        <Icon name="sparkle" size={22} />
      </span>
      <h2 className={styles.introTitle}>Quiz mode</h2>
      <p className={styles.introText}>
        {questionCount} prelims {questionCount === 1 ? 'question' : 'questions'}. The
        timer runs while you answer; correct answers stay hidden until you finish.
        Skip freely and submit whenever you like.
      </p>

      {lastScore && (
        <p className={styles.introLast}>
          Last attempt · {lastScore.correct}/{lastScore.total} correct
        </p>
      )}

      <Button variant="primary" size="lg" onClick={onStart}>
        Start quiz
      </Button>
    </div>
  );
}
