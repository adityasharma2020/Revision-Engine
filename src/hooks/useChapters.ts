import { useServices } from '../context/ServicesContext';
import type { Chapter, ChapterManifest } from '../types';
import { useAsync, type AsyncState } from './useAsync';

/** Load the chapter index (cached by the service). */
export function useManifest(): AsyncState<ChapterManifest> {
  const { chapters } = useServices();
  return useAsync(() => chapters.loadManifest(), [chapters]);
}

/** Load a single full chapter by id. */
export function useChapter(id: string): AsyncState<Chapter> {
  const { chapters } = useServices();
  return useAsync(() => chapters.loadChapter(id), [chapters, id]);
}
