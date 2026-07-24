import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, Button } from '../../components/common';
import { Page } from '../../components/layout';
import { QuizSession } from '../../components/quiz/QuizRunner/QuizSession';
import { Routes } from '../../constants/routes';
import { loadQuizDefinition, objectiveQuizDefinition, removeQuizDefinition, saveQuizDefinition } from '../../services/quiz';
import { useDailyRevisionAssignment } from '../../hooks/useDailyRevisionAssignment';
import { PdfWorkspace } from '../../components/study/PdfWorkspace';
import styles from './QuizSession.module.css';

export function QuizSessionPage() {
  const { quizId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { assignment, ready: assignmentReady, save } = useDailyRevisionAssignment();
  const storedDefinition = loadQuizDefinition(quizId);
  const assignmentDefinition = assignment?.status === 'active' && assignment.definition.id === quizId
    ? objectiveQuizDefinition(assignment.definition)
    : null;
  const definition = storedDefinition ?? assignmentDefinition;
  if (!storedDefinition && assignmentDefinition) saveQuizDefinition(assignmentDefinition);

  if (!definition) {
    if (!assignmentReady) return <Page narrow><p>Restoring quiz session…</p></Page>;
    return <Page narrow><EmptyState icon="clock" title="Quiz session unavailable" description="This quiz definition is missing or expired. Generate a new quiz to continue." action={<Button variant="primary" onClick={() => navigate(Routes.revision)}>Open Daily Revision</Button>} /></Page>;
  }

  return <Page className={styles.workspacePage}>
    <PdfWorkspace chapterId={definition.chapter.id}>
      <QuizSession
      sessionId={definition.id}
      chapter={definition.chapter}
      questions={definition.questions}
      settings={definition.settings}
      questionSet={definition.questionSet}
      questionChapterIds={definition.questionChapterIds}
      questionSourceIds={definition.questionSourceIds}
      questionRevisionMeta={definition.questionRevisionMeta}
      studyQuote={definition.studyQuote}
      purpose={definition.purpose}
      dailyDateKey={definition.dailyDateKey}
      submitOnMount={searchParams.get('submit') === '1'}
      onComplete={(resultId, score) => {
        if (definition.purpose === 'daily-revision' && definition.dailyDateKey) {
          const dailyAssignment = assignment?.dateKey === definition.dailyDateKey
            ? assignment
            : {
                dateKey: definition.dailyDateKey,
                status: 'active' as const,
                definition,
                generatedAt: definition.createdAt,
                attemptNumber: 1,
              };
          save({
            ...dailyAssignment,
            status: 'completed',
            completedAt: Date.now(),
            resultId,
            score,
          });
        }
        removeQuizDefinition(definition.id);
        navigate(Routes.quizResult(resultId), { replace: true });
      }}
      />
    </PdfWorkspace>
  </Page>;
}
