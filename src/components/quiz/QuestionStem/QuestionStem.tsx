import type { PrelimsQuestion } from '../../../types';
import { questionPresentation } from '../../../utils/questionPresentation';
import styles from './QuestionStem.module.css';

export function QuestionStem({ question, className }: {
  question: PrelimsQuestion;
  className?: string;
}) {
  if (question.pairs && question.pairs.length > 0) {
    return (
      <div className={`${styles.stem}${className ? ` ${className}` : ''}`}>
        {question.lead && <p className={styles.lead}>{question.lead}</p>}
        <div className={styles.pairTable} role="table" aria-label="Items to match">
          <div className={styles.pairHeader} role="row">
            <span role="columnheader">{question.pairLeftLabel || 'List I'}</span>
            <span role="columnheader">{question.pairRightLabel || 'List II'}</span>
          </div>
          {question.pairs.map((pair, index) => (
            <div className={styles.pairRow} role="row" key={index}>
              <span role="cell"><b>{index + 1}</b>{pair.left}</span>
              <span role="cell"><b>{String.fromCharCode(65 + index)}</b>{pair.right}</span>
            </div>
          ))}
        </div>
        {question.ask && <p className={styles.ask}>{question.ask}</p>}
      </div>
    );
  }

  if (question.assertion || question.reason) {
    return (
      <div className={`${styles.stem}${className ? ` ${className}` : ''}`}>
        {question.lead && <p className={styles.lead}>{question.lead}</p>}
        <div className={styles.assertions}>
          {question.assertion && <p><b>A</b><span><strong>Assertion:</strong> {question.assertion}</span></p>}
          {question.reason && <p><b>R</b><span><strong>Reason:</strong> {question.reason}</span></p>}
        </div>
        {question.ask && <p className={styles.ask}>{question.ask}</p>}
      </div>
    );
  }

  const presentation = questionPresentation(question);
  if (!presentation) return <p className={className}>{question.statement}</p>;

  return (
    <div className={`${styles.stem}${className ? ` ${className}` : ''}`}>
      {presentation.lead && <p className={styles.lead}>{presentation.lead}</p>}
      <ol className={styles.statements}>
        {presentation.statements.map((statement, index) => (
          <li key={index}>{statement}</li>
        ))}
      </ol>
      {presentation.ask && <p className={styles.ask}>{presentation.ask}</p>}
    </div>
  );
}
