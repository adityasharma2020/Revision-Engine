import type { Chapter, ChapterManifest } from '../../types';
import { chapterToSummary } from '../../utils/chapters';
import { getSupabase } from '../supabase/client';
import { loadPublishedChapter, loadPublishedChapters } from '../supabase/communityChapters';
import { ChapterParseError } from './errors';

/** Loads the public chapter catalogue from Supabase. */
export class ChapterService {
  private readonly cache = new Map<string, Chapter>();

  async loadManifest(): Promise<ChapterManifest> {
    const chapters = await this.loadAllChapters();
    return {
      generatedAt: new Date().toISOString(),
      chapters: chapters.map((chapter) => chapterToSummary(chapter, 'public')),
    };
  }

  async loadChapter(id: string): Promise<Chapter> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const client = getSupabase();
    if (!client) throw new ChapterParseError('Public chapters are unavailable.', 'id');
    const chapter = await loadPublishedChapter(client, id);
    if (!chapter) throw new ChapterParseError(`Unknown chapter "${id}"`, 'id');
    this.cache.set(id, chapter);
    return chapter;
  }

  async loadAllChapters(): Promise<Chapter[]> {
    const client = getSupabase();
    if (!client) return [];
    const chapters = await loadPublishedChapters(client);
    chapters.forEach((chapter) => this.cache.set(chapter.id, chapter));
    return chapters;
  }

  clearCache(id?: string) {
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }
}
