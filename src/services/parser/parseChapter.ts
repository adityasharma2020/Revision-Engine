import type {
  Chapter,
  Difficulty,
  MainsQuestion,
  PrelimsQuestion,
  QuestionOption,
  QuestionPair,
} from '../../types';
import { ChapterParseError } from './errors';
import {
  optionalEnum,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireArray,
  requireNumber,
  requireObject,
  requireString,
} from './guards';

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const satisfies readonly Difficulty[];
const PRELIMS_TYPES = [
  'standard',
  'statements',
  'how-many',
  'match-pairs',
  'pair-evaluation',
  'assertion-reason',
  'sequence',
  'map-based',
  'passage-based',
] as const;

function parseOption(raw: unknown, path: string): QuestionOption {
  const obj = requireObject(raw, path);
  return {
    id: requireString(obj.id, `${path}.id`),
    text: requireString(obj.text, `${path}.text`),
  };
}

function parsePair(raw: unknown, path: string): QuestionPair {
  const obj = requireObject(raw, path);
  return {
    left: requireString(obj.left, `${path}.left`),
    right: requireString(obj.right, `${path}.right`),
  };
}

function parsePrelims(raw: unknown, path: string): PrelimsQuestion {
  const obj = requireObject(raw, path);
  const options = requireArray(obj.options, `${path}.options`).map((o, i) =>
    parseOption(o, `${path}.options[${i}]`),
  );
  if (options.length < 2) {
    throw new ChapterParseError('A prelims question needs at least 2 options', `${path}.options`);
  }
  const answer = requireString(obj.answer, `${path}.answer`);
  const pairs = obj.pairs === undefined
    ? undefined
    : requireArray(obj.pairs, `${path}.pairs`).map((pair, index) =>
        parsePair(pair, `${path}.pairs[${index}]`),
      );
  if (!options.some((o) => o.id === answer)) {
    throw new ChapterParseError(
      `answer "${answer}" does not match any option id`,
      `${path}.answer`,
    );
  }
  return {
    id: requireString(obj.id, `${path}.id`),
    statement: requireString(obj.statement, `${path}.statement`),
    lead: optionalString(obj.lead, `${path}.lead`),
    statements: optionalStringArray(obj.statements, `${path}.statements`),
    ask: optionalString(obj.ask, `${path}.ask`),
    questionType: optionalEnum(obj.questionType, PRELIMS_TYPES, `${path}.questionType`),
    pairs,
    pairLeftLabel: optionalString(obj.pairLeftLabel, `${path}.pairLeftLabel`),
    pairRightLabel: optionalString(obj.pairRightLabel, `${path}.pairRightLabel`),
    assertion: optionalString(obj.assertion, `${path}.assertion`),
    reason: optionalString(obj.reason, `${path}.reason`),
    options,
    answer,
    explanation: optionalString(obj.explanation, `${path}.explanation`),
    difficulty: optionalEnum(obj.difficulty, DIFFICULTIES, `${path}.difficulty`),
    tags: optionalStringArray(obj.tags, `${path}.tags`),
    source: optionalString(obj.source, `${path}.source`),
    origin: optionalString(obj.origin, `${path}.origin`),
    year: optionalNumber(obj.year, `${path}.year`),
  };
}

function parseMains(raw: unknown, path: string): MainsQuestion {
  const obj = requireObject(raw, path);
  return {
    id: requireString(obj.id, `${path}.id`),
    question: requireString(obj.question, `${path}.question`),
    modelAnswer: optionalString(obj.modelAnswer, `${path}.modelAnswer`),
    keyPoints: optionalStringArray(obj.keyPoints, `${path}.keyPoints`),
    explanation: optionalString(obj.explanation, `${path}.explanation`),
    wordLimit: optionalNumber(obj.wordLimit, `${path}.wordLimit`),
    marks: optionalNumber(obj.marks, `${path}.marks`),
    difficulty: optionalEnum(obj.difficulty, DIFFICULTIES, `${path}.difficulty`),
    tags: optionalStringArray(obj.tags, `${path}.tags`),
    origin: optionalString(obj.origin, `${path}.origin`),
    year: optionalNumber(obj.year, `${path}.year`),
  };
}

function assertUniqueIds(ids: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new ChapterParseError(`Duplicate question id "${id}"`, path);
    }
    seen.add(id);
  }
}

/**
 * Parse and validate a raw JSON value into a trusted `Chapter`.
 * Throws `ChapterParseError` (with a precise path) on the first problem.
 */
export function parseChapter(raw: unknown, file?: string): Chapter {
  try {
    const obj = requireObject(raw, 'root');
    const prelims = requireArray(obj.prelims ?? [], 'prelims').map((q, i) =>
      parsePrelims(q, `prelims[${i}]`),
    );
    const mains = requireArray(obj.mains ?? [], 'mains').map((q, i) =>
      parseMains(q, `mains[${i}]`),
    );
    assertUniqueIds(
      [...prelims.map((q) => q.id), ...mains.map((q) => q.id)],
      'questions',
    );

    return {
      id: requireString(obj.id, 'id'),
      subject: requireString(obj.subject, 'subject'),
      title: requireString(obj.title, 'title'),
      chapterNumber: requireNumber(obj.chapterNumber, 'chapterNumber'),
      source: optionalString(obj.source, 'source'),
      description: optionalString(obj.description, 'description'),
      tags: optionalStringArray(obj.tags, 'tags'),
      prelims,
      mains,
    };
  } catch (err) {
    if (err instanceof ChapterParseError && file && !err.file) {
      throw new ChapterParseError(err.message, err.path, file);
    }
    throw err;
  }
}
