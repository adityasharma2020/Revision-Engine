import { useState } from 'react';
import type { MainsQuestion } from '../../../types';
import { useUserData } from '../../../context/UserDataContext';
import { QuestionAnnotations } from '../../annotations/QuestionAnnotations';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import styles from './MainsCard.module.css';

interface MainsCardProps {
  question: MainsQuestion;
  index: number;
  /** When provided, enables progress + annotations for this question. */
  chapterId?: string;
}

/**
 * A mains question. The answer stays hidden until the user has attempted it
 * mentally, then reveals the model answer, key points and any explanation —
 * the self-evaluation loop that drives mains revision.
 */
export function MainsCard({ question, index, chapterId }: MainsCardProps) {
  const { recordAttempt } = useUserData();
  const [revealed, setRevealed] = useState(false);
  const hasAnswer = Boolean(
    question.modelAnswer || question.keyPoints?.length || question.explanation,
  );

  const reveal = () => {
    setRevealed(true);
    if (chapterId) {
      recordAttempt({
        chapterId,
        questionId: question.id,
        type: 'mains',
        attemptedAt: Date.now(),
      });
    }
  };

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <span className={styles.index}>{index}</span>
        <div className={styles.headText}>
          <p className={styles.question}>{question.question}</p>
          <div className={styles.meta}>
            {question.marks && <Badge tone="neutral">{question.marks} marks</Badge>}
            {question.wordLimit && (
              <Badge tone="neutral">{question.wordLimit} words</Badge>
            )}
            {question.year && <Badge tone="neutral">PYQ {question.year}</Badge>}
          </div>
        </div>
      </div>

      {hasAnswer && !revealed && (
        <Button variant="secondary" size="sm" onClick={reveal}>
          Reveal model answer
        </Button>
      )}

      {revealed && (
        <div className={styles.answer}>
          {question.keyPoints && question.keyPoints.length > 0 && (
            <div className={styles.block}>
              <span className={styles.label}>Key points</span>
              <ul className={styles.points}>
                {question.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {question.modelAnswer && (
            <div className={styles.block}>
              <span className={styles.label}>Model answer</span>
              <p className={styles.prose}>{question.modelAnswer}</p>
            </div>
          )}

          {question.explanation && (
            <div className={styles.block}>
              <span className={styles.label}>Notes</span>
              <p className={styles.prose}>{question.explanation}</p>
            </div>
          )}
        </div>
      )}

      {chapterId && (
        <QuestionAnnotations
          chapterId={chapterId}
          questionId={question.id}
          type="mains"
          baseTags={question.tags}
        />
      )}
    </article>
  );
}
