import type { PrelimsQuestion, QuizDefinition } from '../../types';

const PREFIX = 'revision-engine:quiz-definition:';

function isObjectiveQuestion(value: unknown): value is PrelimsQuestion {
  if (!value || typeof value !== 'object') return false;
  const question = value as Partial<PrelimsQuestion>;
  return typeof question.id === 'string'
    && typeof question.statement === 'string'
    && Array.isArray(question.options)
    && question.options.length >= 2
    && typeof question.answer === 'string'
    && question.options.some((option) => option?.id === question.answer);
}

/** Quiz sessions are objective-only. Subjective Mains items remain learning content. */
export function objectiveQuizDefinition(definition: QuizDefinition): QuizDefinition | null {
  const questions = definition.questions.filter(isObjectiveQuestion);
  if (questions.length === 0) return null;
  const questionIds = new Set(questions.map((question) => question.id));
  return {
    ...definition,
    chapter: {
      ...definition.chapter,
      prelims: definition.chapter.prelims.filter(isObjectiveQuestion),
      mains: [],
    },
    questions,
    questionSet: {
      ...definition.questionSet,
      questionIds: definition.questionSet.questionIds.filter((id) => questionIds.has(id)),
    },
  };
}

export function saveQuizDefinition(definition: QuizDefinition): void {
  const objectiveDefinition = objectiveQuizDefinition(definition);
  if (!objectiveDefinition) return;
  sessionStorage.setItem(`${PREFIX}${definition.id}`, JSON.stringify(objectiveDefinition));
}

export function loadQuizDefinition(id: string): QuizDefinition | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`);
    return raw ? objectiveQuizDefinition(JSON.parse(raw) as QuizDefinition) : null;
  } catch {
    return null;
  }
}

export function removeQuizDefinition(id: string): void {
  sessionStorage.removeItem(`${PREFIX}${id}`);
}
