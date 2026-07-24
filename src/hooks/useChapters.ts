import { useMemo } from 'react';
import { useServices } from '../context/ServicesContext';
import { useUserData } from '../context/UserDataContext';
import type { Chapter, ChapterSummary } from '../types';
import { chapterToSummary } from '../utils/chapters';
import { useAsync, type AsyncState } from './useAsync';

/**
 * The combined library: database-backed public chapters plus the user's
 * private uploads. Adding a private upload updates this without a reload.
 */
export function useLibrary(): AsyncState<ChapterSummary[]> {
  const { chapters } = useServices();
  const { userChapters } = useUserData();

  const userSummaries = useMemo(
    () => userChapters.map((c) => chapterToSummary(c, 'user')),
    [userChapters],
  );

  return useAsync<ChapterSummary[]>(async () => {
    const manifest = await chapters.loadManifest();
    const publicChapters = manifest.chapters.map(
      (chapter): ChapterSummary => ({ ...chapter, origin: 'public' }),
    );
    const privateIds = new Set(userSummaries.map((chapter) => chapter.id));
    return [...userSummaries, ...publicChapters.filter((chapter) => !privateIds.has(chapter.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, userSummaries]);
}

/** Load a single chapter by id — user uploads resolve instantly, else static. */
export function useChapter(id: string, snapshot?: Chapter): AsyncState<Chapter> {
  const { chapters } = useServices();
  const { userChapters } = useUserData();
  const userChapter = useMemo(
    () => userChapters.find((c) => c.id === id) ?? null,
    [userChapters, id],
  );

  return useAsync<Chapter>(async () => {
    if (snapshot) return snapshot;
    if (userChapter) return userChapter;
    return chapters.loadChapter(id);
  }, [id, snapshot, userChapter, chapters]);
}
