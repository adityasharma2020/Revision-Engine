import { subjectStyle } from '../constants/subjects';
import type { ChapterSummary } from '../types';

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
