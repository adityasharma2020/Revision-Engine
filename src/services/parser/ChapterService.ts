import type { Chapter, ChapterManifest } from '../../types';
import { ChapterParseError } from './errors';
import { parseChapter } from './parseChapter';

const CHAPTERS_DIR = 'chapters';
const MANIFEST_FILE = 'manifest.json';

/**
 * Loads chapter data from the static `chapters/` directory.
 *
 * The manifest (generated at build time — see scripts/generate-manifest.mjs)
 * is fetched once and cached; full chapter files are fetched lazily and cached
 * on first open. Because discovery is driven entirely by the manifest, adding a
 * new chapter JSON never requires a code change.
 */
export class ChapterService {
  private manifest: ChapterManifest | null = null;
  private manifestPromise: Promise<ChapterManifest> | null = null;
  private readonly chapters = new Map<string, Chapter>();
  private readonly baseUrl: string;

  constructor(baseUrl: string = import.meta.env.BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private url(...segments: string[]): string {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return `${base}${CHAPTERS_DIR}/${segments.join('/')}`;
  }

  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (cause) {
      throw new Error(`Network error loading ${url}`, { cause });
    }
    if (!response.ok) {
      throw new Error(`Failed to load ${url} (${response.status})`);
    }
    return response.json();
  }

  /** Fetch (once) and return the chapter index. Concurrent calls share one request. */
  async loadManifest(force = false): Promise<ChapterManifest> {
    if (this.manifest && !force) return this.manifest;
    if (this.manifestPromise && !force) return this.manifestPromise;

    this.manifestPromise = this.fetchJson(this.url(MANIFEST_FILE))
      .then((raw) => {
        const manifest = raw as ChapterManifest;
        this.manifest = manifest;
        return manifest;
      })
      .finally(() => {
        this.manifestPromise = null;
      });

    return this.manifestPromise;
  }

  /** Fetch, validate and cache a single full chapter by id. */
  async loadChapter(id: string): Promise<Chapter> {
    const cached = this.chapters.get(id);
    if (cached) return cached;

    const manifest = await this.loadManifest();
    const entry = manifest.chapters.find((c) => c.id === id);
    if (!entry) {
      throw new ChapterParseError(`Unknown chapter "${id}"`, 'id');
    }

    const raw = await this.fetchJson(this.url(entry.file));
    const chapter = parseChapter(raw, entry.file);
    if (chapter.id !== id) {
      throw new ChapterParseError(
        `Chapter id "${chapter.id}" does not match manifest id "${id}"`,
        'id',
        entry.file,
      );
    }
    this.chapters.set(id, chapter);
    return chapter;
  }
}
