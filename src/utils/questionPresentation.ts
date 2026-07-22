import type { PrelimsQuestion } from '../types';

export interface QuestionPresentation {
  lead: string;
  statements: readonly string[];
  ask: string;
}

const ASK_PATTERN = /\b(Which of (?:the )?(?:above )?statements|Which of the above|Which one of|How many of|Select the correct|Which among)\b/i;

/** Prefer explicit JSON structure, then safely detect common numbered UPSC stems. */
export function questionPresentation(question: PrelimsQuestion): QuestionPresentation | null {
  if (question.statements && question.statements.length >= 2) {
    return {
      lead: question.lead?.trim() ?? '',
      statements: question.statements,
      ask: question.ask?.trim() ?? '',
    };
  }

  const text = question.statement.trim();
  const candidates = [...text.matchAll(/(?:^|\s)(\d+)\.\s+/g)];
  if (candidates.length < 2 || candidates[0][1] !== '1') return null;

  // Years and other values can look like list markers (for example
  // "Delhi in 1556. Which..."). Only accept a consecutive 1, 2, 3…
  // sequence so those values remain part of their statement.
  const matches: RegExpMatchArray[] = [];
  let expected = 1;
  for (const candidate of candidates) {
    if (Number(candidate[1]) === expected) {
      matches.push(candidate);
      expected += 1;
    }
  }
  if (matches.length < 2) return null;

  const firstStart = (matches[0].index ?? 0) + (matches[0][0].startsWith(' ') ? 1 : 0);
  const lead = text.slice(0, firstStart).trim().replace(/:\s*$/, '');
  const statements = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return text.slice(start, end).trim();
  });

  let ask = '';
  const final = statements[statements.length - 1];
  const askMatch = final.match(ASK_PATTERN);
  if (askMatch?.index !== undefined) {
    ask = final.slice(askMatch.index).trim();
    statements[statements.length - 1] = final.slice(0, askMatch.index).trim();
  }

  if (statements.some((statement) => statement.length === 0)) return null;

  return { lead, statements, ask };
}
