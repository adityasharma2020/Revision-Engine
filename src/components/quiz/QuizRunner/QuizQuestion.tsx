import type { PrelimsQuestion } from '../../../types';
import { cx } from '../../../utils/cx';
import { Badge } from '../../common/Badge';
import { formatQuestionOrigin } from '../../../utils/questionOrigin';
import styles from './QuizRunner.module.css';
import { QuestionStem } from '../QuestionStem';
import { QuestionAnnotations } from '../../annotations/QuestionAnnotations';

interface QuizQuestionProps {
  question: PrelimsQuestion;
  selected: string | null;
  onSelect: (optionId: string) => void;
  disabled?: boolean;
  chapterId: string;
}

/** A quiz question in-flight: selectable, but never reveals the answer. */
export function QuizQuestion({ question, selected, onSelect, disabled = false, chapterId }: QuizQuestionProps) {
  return (
    <div className={styles.question}>
      <div className={styles.questionMeta}>
        <div className={styles.questionMetaBadges}>
          {question.origin && (
          <Badge tone={question.origin.toUpperCase().startsWith('PYQ') ? 'accent' : 'neutral'}>
            {formatQuestionOrigin(question.origin)}
          </Badge>
          )}
        </div>
        <QuestionAnnotations
          chapterId={chapterId}
          questionId={question.id}
          type="prelims"
          variant="bookmark-icon"
          disabled={disabled}
        />
      </div>
      <QuestionStem question={question} className={styles.questionStatement} />
      <ul className={styles.questionOptions}>
        {question.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className={cx(styles.qOption, selected === option.id && styles.qOptionActive)}
              onClick={() => onSelect(option.id)}
              disabled={disabled}
              aria-pressed={selected === option.id}
            >
              <span className={styles.qMarker}>{option.id.toUpperCase()}</span>
              <span>{option.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
