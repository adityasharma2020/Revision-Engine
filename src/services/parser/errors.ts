/** Raised when a chapter JSON file does not match the domain schema. */
export class ChapterParseError extends Error {
  /** JSON path to the offending field, e.g. `prelims[2].answer`. */
  readonly path: string;
  /** Source file the error came from, if known. */
  readonly file?: string;

  constructor(message: string, path: string, file?: string) {
    super(message);
    this.name = 'ChapterParseError';
    this.path = path;
    this.file = file;
  }
}
