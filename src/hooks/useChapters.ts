import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../context/ServicesContext';
import { useUserData } from '../context/UserDataContext';
import type { Chapter, ChapterSummary } from '../types';
import { chapterToSummary } from '../utils/chapters';
import { useAsync, type AsyncState } from './useAsync';

function combineLibrary(
  userSummaries: readonly ChapterSummary[],
  publicChapters: readonly ChapterSummary[],
): ChapterSummary[] {
  const privateIds = new Set(userSummaries.map((chapter) => chapter.id));
  return [
    ...userSummaries,
    ...publicChapters
      .map((chapter): ChapterSummary => ({ ...chapter, origin: 'public' }))
      .filter((chapter) => !privateIds.has(chapter.id)),
  ];
}

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

  const [state, setState] = useState<AsyncState<ChapterSummary[]>>(() => {
    const cached = chapters.getCachedManifest();
    return cached
      ? { status: 'success', data: combineLibrary(userSummaries, cached.chapters), error: null }
      : { status: 'loading', data: null, error: null };
  });

  useEffect(() => {
    let active = true;
    const cached = chapters.getCachedManifest();
    if (cached) {
      setState({ status: 'success', data: combineLibrary(userSummaries, cached.chapters), error: null });
      return () => { active = false; };
    }

    setState({ status: 'loading', data: null, error: null });
    void chapters.loadManifest().then((manifest) => {
      if (active) setState({ status: 'success', data: combineLibrary(userSummaries, manifest.chapters), error: null });
    }, (error: unknown) => {
      if (active) setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });

    return () => { active = false; };
  }, [chapters, userSummaries]);

  return state;
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
