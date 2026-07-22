import type { QuizDefinition } from '../../types';

const PREFIX = 'revision-engine:quiz-definition:';

export function saveQuizDefinition(definition: QuizDefinition): void {
  sessionStorage.setItem(`${PREFIX}${definition.id}`, JSON.stringify(definition));
}

export function loadQuizDefinition(id: string): QuizDefinition | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`);
    return raw ? JSON.parse(raw) as QuizDefinition : null;
  } catch {
    return null;
  }
}

export function removeQuizDefinition(id: string): void {
  sessionStorage.removeItem(`${PREFIX}${id}`);
}
