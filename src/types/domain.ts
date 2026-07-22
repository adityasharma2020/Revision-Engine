/**
 * Core domain model for the UPSC Revision Engine.
 *
 * These types are the single source of truth for the shape of chapter data.
 * Chapter JSON files (public/chapters/*.json) are validated against them at
 * load time, so the UI can trust every field it renders.
 *
 * The UI must NEVER hard-code knowledge of a specific chapter or subject —
 * everything below is generic and driven entirely by the JSON.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Subject is intentionally a plain string, not a closed union: adding a new
 * subject must never require a code change. Known subjects are provided as
 * constants for autocomplete/colour-mapping only (see constants/subjects.ts).
 */
export type Subject = string;

/** A single selectable option in a prelims (MCQ) question. */
export interface QuestionOption {
  /** Stable identifier within the question, e.g. "a", "b", "c", "d". */
  readonly id: string;
  readonly text: string;
}

export interface PrelimsQuestion {
  readonly id: string;
  readonly statement: string;
  readonly options: readonly QuestionOption[];
  /** Id of the correct QuestionOption. */
  readonly answer: string;
  readonly explanation?: string;
  readonly difficulty?: Difficulty;
  readonly tags?: readonly string[];
  /** Coaching/source attribution for this specific question. */
  readonly source?: string;
  /** Dataset provenance, e.g. FYQ_Pre_1 or PYQ_Pre_2024. */
  readonly origin?: string;
  /** Previous-year-question year, if this is a PYQ. */
  readonly year?: number;
}

export interface MainsQuestion {
  readonly id: string;
  readonly question: string;
  /** Ideal/model answer used for self-evaluation during revision. */
  readonly modelAnswer?: string;
  /** Bullet points the answer must cover — the revision skeleton. */
  readonly keyPoints?: readonly string[];
  readonly explanation?: string;
  readonly wordLimit?: number;
  readonly marks?: number;
  readonly difficulty?: Difficulty;
  readonly tags?: readonly string[];
  /** Dataset provenance, e.g. FYQ_M.1 or PYQ_M.2024. */
  readonly origin?: string;
  readonly year?: number;
}

/** A fully-parsed chapter — the unit a user revises. */
export interface Chapter {
  readonly id: string;
  readonly subject: Subject;
  readonly title: string;
  readonly chapterNumber: number;
  readonly source?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly prelims: readonly PrelimsQuestion[];
  readonly mains: readonly MainsQuestion[];
}

export type QuestionType = 'prelims' | 'mains';

/**
 * Lightweight chapter metadata, listed in the manifest so the dashboard can
 * render instantly without downloading every full chapter file. The heavy
 * `prelims`/`mains` arrays are fetched lazily only when a chapter is opened.
 */
export type ChapterOrigin = 'builtin' | 'user';

export interface ChapterSummary {
  readonly id: string;
  readonly subject: Subject;
  readonly title: string;
  readonly chapterNumber: number;
  readonly source?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  /** Path of the chapter file relative to the chapters directory (builtin only). */
  readonly file?: string;
  readonly prelimsCount: number;
  readonly mainsCount: number;
  /** Where the chapter came from — shipped with the app, or user-uploaded. */
  readonly origin?: ChapterOrigin;
}

/** The generated index of all available chapters. */
export interface ChapterManifest {
  readonly generatedAt: string;
  readonly chapters: readonly ChapterSummary[];
}
