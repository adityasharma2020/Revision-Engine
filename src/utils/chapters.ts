import { subjectStyle } from '../constants/subjects';
import type { Chapter, ChapterOrigin, ChapterSummary } from '../types';

/** Derive a lightweight summary from a full chapter (used for user uploads). */
export function chapterToSummary(
  chapter: Chapter,
  origin: ChapterOrigin = 'user',
): ChapterSummary {
  return {
    id: chapter.id,
    subject: chapter.subject,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    source: chapter.source,
    description: chapter.description,
    tags: chapter.tags,
    prelimsCount: chapter.prelims.length,
    mainsCount: chapter.mains.length,
    origin,
  };
}

export interface SubjectGroup {
  readonly subject: string;
  readonly label: string;
  readonly hue: number;
  readonly chapters: ChapterSummary[];
}

/** Group chapter summaries by subject, ordered alphabetically, chapters by number. */
export function groupBySubject(chapters: readonly ChapterSummary[]): SubjectGroup[] {
  const groups = new Map<string, ChapterSummary[]>();
  for (const chapter of chapters) {
    const key = chapter.subject;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(chapter);
  }

  return [...groups.entries()]
    .map(([subject, list]) => {
      const { label, hue } = subjectStyle(subject);
      return {
        subject,
        label,
        hue,
        chapters: [...list].sort((a, b) => a.chapterNumber - b.chapterNumber),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
