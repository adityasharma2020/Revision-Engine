import type { Chapter, ChapterManifest } from '../../types';
import { chapterToSummary } from '../../utils/chapters';
import { getSupabase } from '../supabase/client';
import { loadPublishedChapter, loadPublishedChapters } from '../supabase/communityChapters';
import { ChapterParseError } from './errors';

const CATALOGUE_CACHE_MS = 5 * 60 * 1000;

/** Loads the public chapter catalogue from Supabase. */
export class ChapterService {
  private readonly cache = new Map<string, Chapter>();
  private catalogue: { chapters: Chapter[]; loadedAt: number } | null = null;
  private catalogueRequest: Promise<Chapter[]> | null = null;
  private catalogueRevision = 0;

  getCachedManifest(): ChapterManifest | null {
    if (!this.catalogue || Date.now() - this.catalogue.loadedAt > CATALOGUE_CACHE_MS) return null;
    return {
      generatedAt: new Date(this.catalogue.loadedAt).toISOString(),
      chapters: this.catalogue.chapters.map((chapter) => chapterToSummary(chapter, 'public')),
    };
  }

  async loadManifest(): Promise<ChapterManifest> {
    const cached = this.getCachedManifest();
    if (cached) return cached;
    const chapters = await this.loadAllChapters();
    return {
      generatedAt: new Date(this.catalogue?.loadedAt ?? Date.now()).toISOString(),
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
    if (this.catalogue && Date.now() - this.catalogue.loadedAt <= CATALOGUE_CACHE_MS) {
      return this.catalogue.chapters;
    }
    if (this.catalogueRequest) return this.catalogueRequest;

    const revision = this.catalogueRevision;
    const client = getSupabase();
    const request = client ? loadPublishedChapters(client) : Promise.resolve([]);
    this.catalogueRequest = request;

    let chapters: Chapter[];
    try {
      chapters = await request;
      if (revision === this.catalogueRevision) {
        const loadedAt = Date.now();
        this.catalogue = { chapters, loadedAt };
        chapters.forEach((chapter) => this.cache.set(chapter.id, chapter));
      }
    } finally {
      if (this.catalogueRequest === request) this.catalogueRequest = null;
    }

    if (revision !== this.catalogueRevision) return this.loadAllChapters();
    return chapters;
  }

  clearCache(id?: string) {
    this.catalogueRevision += 1;
    this.catalogue = null;
    this.catalogueRequest = null;
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }
}
