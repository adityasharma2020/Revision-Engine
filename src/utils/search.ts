import type { AnnotationMap, Chapter, QuestionType } from '../types';
import { annotationKey } from './annotations';
import { questionOriginKind, type QuestionOriginKind } from './questionOrigin';

export type SearchDocumentType = 'chapter' | QuestionType;

export interface SearchDocument {
  id: string;
  chapterId: string;
  chapterTitle: string;
  subject: string;
  type: SearchDocumentType;
  title: string;
  body: string;
  answerText: string;
  tags: readonly string[];
  origin?: string;
  year?: number;
}

export interface SearchFilters {
  chapterId?: string;
  type?: SearchDocumentType | 'all';
  origin?: QuestionOriginKind | 'all';
  tag?: string;
}

export interface SearchHit extends SearchDocument {
  score: number;
  snippet: string;
}

const normalize = (value: string) =>
  value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const mergedTags = (base: readonly string[] = [], personal: readonly string[] = []) =>
  [...new Set([...base, ...personal].map((tag) => tag.trim()).filter(Boolean))];

export function buildSearchIndex(
  chapters: readonly Chapter[],
  annotations: AnnotationMap = {},
): SearchDocument[] {
  return chapters.flatMap((chapter) => {
    const chapterDoc: SearchDocument = {
      id: `chapter:${chapter.id}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      subject: chapter.subject,
      type: 'chapter',
      title: chapter.title,
      body: [chapter.description, chapter.source].filter(Boolean).join(' '),
      answerText: '',
      tags: chapter.tags ?? [],
    };
    const prelims = chapter.prelims.map((question): SearchDocument => ({
      id: `prelims:${chapter.id}:${question.id}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      subject: chapter.subject,
      type: 'prelims',
      title: question.statement,
      body: question.options.map((option) => option.text).join(' '),
      answerText: question.explanation ?? '',
      tags: mergedTags(
        question.tags,
        annotations[annotationKey(chapter.id, question.id)]?.tags,
      ),
      origin: question.origin,
      year: question.year,
    }));
    const mains = chapter.mains.map((question): SearchDocument => ({
      id: `mains:${chapter.id}:${question.id}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      subject: chapter.subject,
      type: 'mains',
      title: question.question,
      body: [...(question.keyPoints ?? []), question.modelAnswer ?? ''].join(' '),
      answerText: question.explanation ?? '',
      tags: mergedTags(
        question.tags,
        annotations[annotationKey(chapter.id, question.id)]?.tags,
      ),
      origin: question.origin,
      year: question.year,
    }));
    return [chapterDoc, ...prelims, ...mains];
  });
}

function makeSnippet(document: SearchDocument, query: string): string {
  const source = document.body || document.answerText || document.title;
  if (!query.trim()) return source.slice(0, 180);
  const at = normalize(source).indexOf(normalize(query.trim()));
  const start = Math.max(0, at < 0 ? 0 : at - 70);
  const prefix = start > 0 ? '…' : '';
  const suffix = start + 180 < source.length ? '…' : '';
  return `${prefix}${source.slice(start, start + 180).trim()}${suffix}`;
}

export function searchIndex(
  index: readonly SearchDocument[],
  query: string,
  filters: SearchFilters = {},
): SearchHit[] {
  const phrase = normalize(query.trim());
  const terms = phrase.split(/\s+/).filter(Boolean);
  const hasFilter = Boolean(
    filters.chapterId || (filters.type && filters.type !== 'all') ||
      (filters.origin && filters.origin !== 'all') || filters.tag,
  );
  if (terms.length === 0 && !hasFilter) return [];

  return index
    .filter((document) => {
      if (filters.chapterId && document.chapterId !== filters.chapterId) return false;
      if (filters.type && filters.type !== 'all' && document.type !== filters.type) return false;
      if (filters.origin && filters.origin !== 'all') {
        if (document.type === 'chapter' || questionOriginKind(document.origin) !== filters.origin) {
          return false;
        }
      }
      if (filters.tag && !document.tags.some((tag) => normalize(tag) === normalize(filters.tag!))) {
        return false;
      }
      const haystack = normalize(
        [document.title, document.body, document.answerText, document.chapterTitle,
          document.subject, document.tags.join(' '), document.origin, document.year]
          .filter(Boolean).join(' '),
      );
      return terms.every((term) => haystack.includes(term));
    })
    .map((document): SearchHit => {
      const title = normalize(document.title);
      const tags = normalize(document.tags.join(' '));
      const chapter = normalize(`${document.chapterTitle} ${document.subject}`);
      const body = normalize(document.body);
      const answer = normalize(document.answerText);
      let score = document.type === 'chapter' ? 15 : 0;
      if (phrase && title === phrase) score += 200;
      if (phrase && title.includes(phrase)) score += 100;
      if (phrase && tags.includes(phrase)) score += 90;
      if (phrase && chapter.includes(phrase)) score += 55;
      for (const term of terms) {
        if (title.includes(term)) score += 30;
        if (tags.includes(term)) score += 25;
        if (body.includes(term)) score += 12;
        if (answer.includes(term)) score += 6;
      }
      return { ...document, score, snippet: makeSnippet(document, query) };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
