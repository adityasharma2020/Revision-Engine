import { ChapterService } from './ChapterService';

export { ChapterService } from './ChapterService';
export { parseChapter } from './parseChapter';
export { ChapterParseError } from './errors';

/** Single shared chapter loader for the app. */
export function createChapterService(): ChapterService {
  return new ChapterService();
}
