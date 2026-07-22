import type {
  Chapter,
  Difficulty,
  MainsQuestion,
  PrelimsQuestion,
  QuestionOption,
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

function parseOption(raw: unknown, path: string): QuestionOption {
  const obj = requireObject(raw, path);
  return {
    id: requireString(obj.id, `${path}.id`),
    text: requireString(obj.text, `${path}.text`),
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
  if (!options.some((o) => o.id === answer)) {
    throw new ChapterParseError(
      `answer "${answer}" does not match any option id`,
      `${path}.answer`,
    );
  }
  return {
    id: requireString(obj.id, `${path}.id`),
    statement: requireString(obj.statement, `${path}.statement`),
    options,
    answer,
    explanation: optionalString(obj.explanation, `${path}.explanation`),
    difficulty: optionalEnum(obj.difficulty, DIFFICULTIES, `${path}.difficulty`),
    tags: optionalStringArray(obj.tags, `${path}.tags`),
    source: optionalString(obj.source, `${path}.source`),
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
