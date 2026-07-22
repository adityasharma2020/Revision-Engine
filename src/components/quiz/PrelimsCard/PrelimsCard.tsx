import { useRef, useState } from 'react';
import type { PrelimsQuestion } from '../../../types';
import { useUserData } from '../../../context/UserDataContext';
import { QuestionAnnotations } from '../../annotations/QuestionAnnotations';
import { Badge } from '../../common/Badge';
import { Icon } from '../../common/Icon';
import { cx } from '../../../utils/cx';
import { formatQuestionOrigin } from '../../../utils/questionOrigin';
import styles from './PrelimsCard.module.css';
import { QuestionStem } from '../QuestionStem';

interface PrelimsCardProps {
  question: PrelimsQuestion;
  index: number;
  /**
   * 'interactive' (default): the user picks an option, which reveals the answer.
   * 'review': read-only recap of a previous attempt (used by quiz results).
   */
  mode?: 'interactive' | 'review';
  /** In review mode, the option the user had selected (null = skipped). */
  selectedOptionId?: string | null;
  /** When provided (interactive mode), enables progress + annotations. */
  chapterId?: string;
  onAnswered?: (correct: boolean, selectedOptionId: string) => void;
  elementId?: string;
  focusLabel?: string;
  highlighted?: boolean;
}

/**
 * A single prelims MCQ. In interactive mode, selecting an option reveals
 * correctness and the explanation. In review mode it shows a past answer,
 * fully revealed and non-interactive.
 */
export function PrelimsCard({
  question,
  index,
  mode = 'interactive',
  selectedOptionId = null,
  chapterId,
  onAnswered,
  elementId,
  focusLabel = 'Search match',
  highlighted = false,
}: PrelimsCardProps) {
  const { recordAttempt } = useUserData();
  const [picked, setPicked] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const isReview = mode === 'review';
  const annotatable = Boolean(chapterId);
  const selected = isReview ? selectedOptionId : picked;
  const revealed = isReview || picked !== null;
  const locked = isReview || picked !== null;

  const choose = (optionId: string) => {
    if (locked) return;
    setPicked(optionId);
    const correct = optionId === question.answer;
    onAnswered?.(correct, optionId);
    if (chapterId) {
      recordAttempt({
        chapterId,
        questionId: question.id,
        type: 'prelims',
        selectedOption: optionId,
        correct,
        difficulty: question.difficulty,
        origin: question.origin,
        timeMs: Date.now() - shownAt.current,
        attemptedAt: Date.now(),
      });
    }
  };

  return (
    <article id={elementId} data-focus-label={focusLabel} className={cx(styles.card, highlighted && styles.highlighted)}>
      <div className={styles.head}>
        <span className={styles.index}>{index}</span>
        <QuestionStem question={question} className={styles.statement} />
      </div>

      <ul className={styles.options}>
        {question.options.map((option) => {
          const isAnswer = option.id === question.answer;
          const isPicked = option.id === selected;
          const stateClass = !revealed
            ? undefined
            : isAnswer
              ? styles.correct
              : isPicked
                ? styles.incorrect
                : styles.muted;

          return (
            <li key={option.id}>
              <button
                type="button"
                className={cx(styles.option, stateClass)}
                onClick={() => choose(option.id)}
                disabled={locked}
                aria-pressed={isPicked}
              >
                <span className={styles.marker}>{option.id.toUpperCase()}</span>
                <span className={styles.optionText}>{option.text}</span>
                {revealed && isAnswer && (
                  <Icon name="check" size={16} className={styles.tick} />
                )}
                {revealed && isPicked && !isAnswer && (
                  <Icon name="close" size={16} className={styles.cross} />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {isReview && selected === null && (
        <p className={styles.skipped}>Skipped — not answered.</p>
      )}

      {revealed && question.explanation && (
        <div className={styles.explanation}>
          <span className={styles.explanationLabel}>Explanation</span>
          <p>{question.explanation}</p>
        </div>
      )}

      {(question.origin || question.year || (!annotatable && question.tags?.length)) && (
        <footer className={styles.meta}>
          {question.origin && (
            <Badge tone={question.origin.toUpperCase().startsWith('PYQ') ? 'accent' : 'neutral'}>
              {formatQuestionOrigin(question.origin)}
            </Badge>
          )}
          {question.year && <Badge tone="neutral">PYQ {question.year}</Badge>}
          {!annotatable &&
            question.tags?.map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
        </footer>
      )}

      {annotatable && chapterId && (
        <QuestionAnnotations
          chapterId={chapterId}
          questionId={question.id}
          type="prelims"
          baseTags={question.tags}
        />
      )}
    </article>
  );
}
