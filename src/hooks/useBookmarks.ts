import { useMemo } from 'react';
import { useServices } from '../context/ServicesContext';
import { useUserData } from '../context/UserDataContext';
import type { QuestionType } from '../types';
import { useAsync, type AsyncState } from './useAsync';

export interface ResolvedBookmark {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  questionId: string;
  type: QuestionType;
  text: string;
  note: string;
  tags: readonly string[];
}

/**
 * Resolve the user's bookmarked annotations into displayable questions by
 * loading only the chapters actually referenced. Re-resolves whenever the set
 * of bookmarks changes; missing questions/chapters are skipped gracefully.
 */
export function useBookmarks(): AsyncState<ResolvedBookmark[]> {
  const { annotations, userChapters } = useUserData();
  const { chapters } = useServices();

  const bookmarked = useMemo(
    () => Object.values(annotations).filter((a) => a.bookmarked),
    [annotations],
  );
  const userById = useMemo(
    () => new Map(userChapters.map((c) => [c.id, c])),
    [userChapters],
  );
  const signature = useMemo(
    () =>
      bookmarked
        .map((b) => `${b.chapterId}:${b.questionId}`)
        .sort()
        .join('|'),
    [bookmarked],
  );

  return useAsync<ResolvedBookmark[]>(async () => {
    const chapterIds = [...new Set(bookmarked.map((b) => b.chapterId))];
    const loaded = await Promise.all(
      chapterIds.map((id) =>
        userById.get(id) ?? chapters.loadChapter(id).catch(() => null),
      ),
    );
    const byId = new Map(loaded.filter((c) => c !== null).map((c) => [c.id, c]));

    return bookmarked
      .map((b): ResolvedBookmark | null => {
        const chapter = byId.get(b.chapterId);
        if (!chapter) return null;
        if (b.type === 'prelims') {
          const q = chapter.prelims.find((x) => x.id === b.questionId);
          if (!q) return null;
          return {
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            subject: chapter.subject,
            questionId: q.id,
            type: 'prelims',
            text: q.statement,
            note: b.note,
            tags: b.tags,
          };
        }
        const q = chapter.mains.find((x) => x.id === b.questionId);
        if (!q) return null;
        return {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          subject: chapter.subject,
          questionId: q.id,
          type: 'mains',
          text: q.question,
          note: b.note,
          tags: b.tags,
        };
      })
      .filter((b): b is ResolvedBookmark => b !== null);
    // signature captures the meaningful dependency (which bookmarks exist).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, chapters, userById]);
}
