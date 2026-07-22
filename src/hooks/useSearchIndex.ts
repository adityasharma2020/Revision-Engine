import { useMemo } from 'react';
import { useServices } from '../context/ServicesContext';
import { useUserData } from '../context/UserDataContext';
import { buildSearchIndex, type SearchDocument } from '../utils/search';
import { useAsync, type AsyncState } from './useAsync';

/** Builds one shared index from shipped chapters and the user's private uploads. */
export function useSearchIndex(): AsyncState<SearchDocument[]> {
  const { chapters } = useServices();
  const { annotations, userChapters } = useUserData();
  const privateChapters = useMemo(() => userChapters, [userChapters]);

  return useAsync(async () => {
    const builtIn = await chapters.loadAllChapters();
    const byId = new Map(builtIn.map((chapter) => [chapter.id, chapter]));
    privateChapters.forEach((chapter) => byId.set(chapter.id, chapter));
    return buildSearchIndex([...byId.values()], annotations);
  }, [annotations, chapters, privateChapters]);
}
