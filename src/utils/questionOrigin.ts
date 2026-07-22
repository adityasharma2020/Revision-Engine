export type QuestionOriginKind = 'fyq' | 'pyq' | 'other';

export function questionOriginKind(origin?: string): QuestionOriginKind {
  const value = origin?.trim().toUpperCase() ?? '';
  if (value.startsWith('FYQ')) return 'fyq';
  if (value.startsWith('PYQ')) return 'pyq';
  return 'other';
}

/** Turns data-oriented values such as FYQ_Pre_12 into compact UI copy. */
export function formatQuestionOrigin(origin: string): string {
  const [kind = origin, detail = ''] = origin.trim().split(/[_\s]+/, 2);
  const readable = detail
    .replace(/^Pre[._-]?/i, 'Prelims ')
    .replace(/^M[._-]?/i, 'Mains ')
    .replace(/[._-]+/g, ' ')
    .trim();
  return readable ? `${kind.toUpperCase()} · ${readable}` : kind.toUpperCase();
}
