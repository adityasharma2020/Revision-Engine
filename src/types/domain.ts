/**
 * Core domain model for Revision Engine.
 *
 * These types are the single source of truth for the shape of chapter data.
 * Chapter JSON stored in Supabase is validated at load time, so the UI can
 * trust every field it renders.
 *
 * The UI must NEVER hard-code knowledge of a specific chapter or subject —
 * everything below is generic and driven entirely by the JSON.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type PrelimsQuestionType =
  | 'standard'
  | 'statements'
  | 'how-many'
  | 'match-pairs'
  | 'pair-evaluation'
  | 'assertion-reason'
  | 'sequence'
  | 'map-based'
  | 'passage-based';

export interface QuestionPair {
  readonly left: string;
  readonly right: string;
}

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
  /** Optional structured presentation for numbered/statement-based questions. */
  readonly lead?: string;
  readonly statements?: readonly string[];
  readonly ask?: string;
  readonly questionType?: PrelimsQuestionType;
  /** Rows shown under two labelled columns for matching/pair questions. */
  readonly pairs?: readonly QuestionPair[];
  readonly pairLeftLabel?: string;
  readonly pairRightLabel?: string;
  readonly assertion?: string;
  readonly reason?: string;
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
 * Lightweight chapter metadata used by library and dashboard cards.
 */
export type ChapterOrigin = 'public' | 'user';

export interface ChapterSummary {
  readonly id: string;
  readonly subject: Subject;
  readonly title: string;
  readonly chapterNumber: number;
  readonly source?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  /** Legacy optional path; public chapters are now loaded from Supabase. */
  readonly file?: string;
  readonly prelimsCount: number;
  readonly mainsCount: number;
  /** Where the chapter came from — shipped with the app, or user-uploaded. */
  readonly origin?: ChapterOrigin;
}

/** Public chapter catalogue returned by the chapter service. */
export interface ChapterManifest {
  readonly generatedAt: string;
  readonly chapters: readonly ChapterSummary[];
}
