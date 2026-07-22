/**
 * Analytics derivations.
 *
 * All statistics are computed here from the synced source data (quiz results +
 * learning progress + annotations). Keeping this as pure functions means new
 * insights can be added later without changing how data is recorded — the raw
 * material is already captured granularly (per-question timing, difficulty,
 * timestamps, subject).
 */
import type {
  AnnotationMap,
  Difficulty,
  ProgressMap,
  QuizResultList,
} from '../types';
import { questionOriginKind } from './questionOrigin';

/** Chapter metadata used to label/aggregate analytics (from library summaries). */
export interface ChapterMeta {
  id: string;
  title: string;
  subject: string;
  totalQuestions: number;
}
export type ChapterMetaMap = Record<string, ChapterMeta>;

/** A normalised, gradeable interaction drawn from either mode. */
interface GradedAttempt {
  chapterId: string;
  questionId: string;
  subject: string;
  difficulty?: Difficulty;
  origin?: string;
  correct: boolean | null; // null = not graded (skipped / mains)
  timeMs: number;
  at: number;
  source: 'quiz' | 'learning';
}

const DAY = 24 * 60 * 60 * 1000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function subjectOf(meta: ChapterMetaMap, chapterId: string, fallback?: string): string {
  return meta[chapterId]?.subject ?? fallback ?? 'Other';
}

/** Flatten learning progress + quiz per-question records into one stream. */
function collectAttempts(
  quizResults: QuizResultList,
  progress: ProgressMap,
  meta: ChapterMetaMap,
): { attempts: GradedAttempt[]; legacy: QuizResultList } {
  const attempts: GradedAttempt[] = [];
  const legacy: QuizResultList = [];

  for (const chapter of Object.values(progress)) {
    for (const a of Object.values(chapter.attempts)) {
      attempts.push({
        chapterId: a.chapterId,
        questionId: a.questionId,
        subject: subjectOf(meta, a.chapterId),
        difficulty: a.difficulty,
        origin: a.origin,
        correct: a.type === 'prelims' ? a.correct ?? null : null,
        timeMs: a.timeMs ?? 0,
        at: a.attemptedAt,
        source: 'learning',
      });
    }
  }

  for (const r of quizResults) {
    if (r.includedInAnalytics === false) continue;
    if (!r.perQuestion || r.perQuestion.length === 0) {
      legacy.push(r);
      continue;
    }
    for (const pq of r.perQuestion) {
      attempts.push({
        chapterId: pq.chapterId ?? r.chapterId,
        questionId: pq.questionId,
        subject: subjectOf(meta, pq.chapterId ?? r.chapterId, r.subject),
        difficulty: pq.difficulty,
        origin: pq.origin,
        correct: pq.correct,
        timeMs: pq.timeMs,
        at: r.takenAt,
        source: 'quiz',
      });
    }
  }

  return { attempts, legacy };
}

// ---- Overview --------------------------------------------------------------
export interface Overview {
  answered: number;
  correct: number;
  accuracy: number;
  quizzes: number;
  timeStudiedMs: number;
  chaptersRevised: number;
  bookmarks: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  avgTimePerQuestionMs: number;
}

function streaks(dayKeys: Set<string>): { current: number; longest: number } {
  if (dayKeys.size === 0) return { current: 0, longest: 0 };
  const has = (ts: number) => dayKeys.has(dayKey(ts));

  // Current streak: walk back from today (allowing a start of yesterday).
  const now = Date.now();
  let current = 0;
  let cursor = has(now) ? now : has(now - DAY) ? now - DAY : null;
  while (cursor !== null && has(cursor)) {
    current += 1;
    cursor -= DAY;
  }

  // Longest streak across the sorted day list.
  const sorted = [...dayKeys]
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    })
    .sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = Math.round((sorted[i] - sorted[i - 1]) / DAY);
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

export function computeOverview(
  quizResults: QuizResultList,
  progress: ProgressMap,
  annotations: AnnotationMap,
  meta: ChapterMetaMap,
): Overview {
  const includedResults = quizResults.filter((result) => result.includedInAnalytics !== false);
  const { attempts, legacy } = collectAttempts(includedResults, progress, meta);
  const graded = attempts.filter((a) => a.correct !== null);

  let answered = graded.length;
  let correct = graded.filter((a) => a.correct === true).length;
  for (const r of legacy) {
    answered += r.answered;
    correct += r.correct;
  }

  const learningTime = attempts
    .filter((a) => a.source === 'learning')
    .reduce((sum, a) => sum + a.timeMs, 0);
  const quizTime = includedResults.reduce((sum, r) => sum + r.durationMs, 0);

  const chapters = new Set<string>();
  attempts.forEach((a) => chapters.add(a.chapterId));
  includedResults.forEach((r) => chapters.add(r.chapterId));

  const days = new Set<string>();
  attempts.forEach((a) => days.add(dayKey(a.at)));
  includedResults.forEach((r) => days.add(dayKey(r.takenAt)));

  const quizTimings = attempts.filter((a) => a.source === 'quiz' && a.timeMs > 0);
  const avgTimePerQuestionMs =
    quizTimings.length === 0
      ? 0
      : Math.round(quizTimings.reduce((s, a) => s + a.timeMs, 0) / quizTimings.length);

  const { current, longest } = streaks(days);

  return {
    answered,
    correct,
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    quizzes: includedResults.length,
    timeStudiedMs: learningTime + quizTime,
    chaptersRevised: chapters.size,
    bookmarks: Object.values(annotations).filter((a) => a.bookmarked).length,
    activeDays: days.size,
    currentStreak: current,
    longestStreak: longest,
    avgTimePerQuestionMs,
  };
}

// ---- Accuracy trend (per quiz) --------------------------------------------
export interface TrendPoint {
  label: string;
  accuracy: number;
  correct: number;
  total: number;
  takenAt: number;
}

export function accuracyTrend(results: QuizResultList, limit = 12): TrendPoint[] {
  return results
    .filter((result) => result.includedInAnalytics !== false)
    .slice(0, limit)
    .reverse()
    .map((r, i) => ({
      label: `#${i + 1}`,
      accuracy: r.answered === 0 ? 0 : Math.round((r.correct / r.answered) * 100),
      correct: r.correct,
      total: r.answered,
      takenAt: r.takenAt,
    }));
}

// ---- Daily activity --------------------------------------------------------
export interface DayActivity {
  label: string;
  questions: number;
  timeMs: number;
  at: number;
}

export function dailyActivity(
  quizResults: QuizResultList,
  progress: ProgressMap,
  meta: ChapterMetaMap,
  days = 14,
): DayActivity[] {
  const includedResults = quizResults.filter((result) => result.includedInAnalytics !== false);
  const { attempts } = collectAttempts(includedResults, progress, meta);
  const byDay = new Map<string, { questions: number; timeMs: number }>();
  const bump = (ts: number, questions: number, timeMs: number) => {
    const k = dayKey(ts);
    const cur = byDay.get(k) ?? { questions: 0, timeMs: 0 };
    cur.questions += questions;
    cur.timeMs += timeMs;
    byDay.set(k, cur);
  };
  attempts.forEach((a) => bump(a.at, 1, a.source === 'learning' ? a.timeMs : 0));
  includedResults.forEach((r) => bump(r.takenAt, 0, r.durationMs));

  const out: DayActivity[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * DAY);
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const entry = byDay.get(k) ?? { questions: 0, timeMs: 0 };
    out.push({
      label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      questions: entry.questions,
      timeMs: entry.timeMs,
      at: d.getTime(),
    });
  }
  return out;
}

// ---- Chapter analytics -----------------------------------------------------
export interface ChapterStat {
  chapterId: string;
  title: string;
  subject: string;
  shown: number;
  attempts: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
  coverage: number; // 0–100
  uniqueQuestions: number;
  totalQuestions: number;
  lastStudiedAt: number;
}

export function chapterAnalytics(
  quizResults: QuizResultList,
  progress: ProgressMap,
  meta: ChapterMetaMap,
): ChapterStat[] {
  const { attempts } = collectAttempts(quizResults, progress, meta);
  const groups = new Map<string, GradedAttempt[]>();
  for (const a of attempts) {
    (groups.get(a.chapterId) ?? groups.set(a.chapterId, []).get(a.chapterId)!).push(a);
  }

  const stats: ChapterStat[] = [];
  for (const [chapterId, list] of groups) {
    const graded = list.filter((a) => a.correct !== null);
    const correct = graded.filter((a) => a.correct === true).length;
    const timed = list.filter((a) => a.timeMs > 0);
    const unique = new Set(list.map((a) => a.questionId)).size;
    const total = meta[chapterId]?.totalQuestions ?? unique;
    stats.push({
      chapterId,
      title: meta[chapterId]?.title ?? chapterId,
      subject: meta[chapterId]?.subject ?? list[0]?.subject ?? 'Other',
      shown: list.length,
      attempts: graded.length,
      correct,
      accuracy: graded.length === 0 ? 0 : Math.round((correct / graded.length) * 100),
      avgTimeMs:
        timed.length === 0
          ? 0
          : Math.round(timed.reduce((s, a) => s + a.timeMs, 0) / timed.length),
      coverage: total === 0 ? 0 : Math.min(100, Math.round((unique / total) * 100)),
      uniqueQuestions: unique,
      totalQuestions: total,
      lastStudiedAt: Math.max(...list.map((a) => a.at)),
    });
  }
  return stats.sort((a, b) => b.lastStudiedAt - a.lastStudiedAt);
}

// ---- Subject analytics -----------------------------------------------------
export interface SubjectStat {
  subject: string;
  attempts: number;
  correct: number;
  accuracy: number;
  chapters: number;
}

export function subjectAnalytics(chapterStats: ChapterStat[]): SubjectStat[] {
  const groups = new Map<string, SubjectStat>();
  for (const c of chapterStats) {
    const s = groups.get(c.subject) ?? {
      subject: c.subject,
      attempts: 0,
      correct: 0,
      accuracy: 0,
      chapters: 0,
    };
    s.attempts += c.attempts;
    s.correct += c.correct;
    s.chapters += 1;
    groups.set(c.subject, s);
  }
  return [...groups.values()]
    .map((s) => ({
      ...s,
      accuracy: s.attempts === 0 ? 0 : Math.round((s.correct / s.attempts) * 100),
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

// ---- Difficulty breakdown --------------------------------------------------
export interface DifficultyStat {
  difficulty: Difficulty;
  attempts: number;
  correct: number;
  accuracy: number;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export function difficultyBreakdown(
  quizResults: QuizResultList,
  progress: ProgressMap,
  meta: ChapterMetaMap,
): DifficultyStat[] {
  const { attempts } = collectAttempts(quizResults, progress, meta);
  return DIFFICULTIES.map((difficulty) => {
    const graded = attempts.filter((a) => a.difficulty === difficulty && a.correct !== null);
    const correct = graded.filter((a) => a.correct === true).length;
    return {
      difficulty,
      attempts: graded.length,
      correct,
      accuracy: graded.length === 0 ? 0 : Math.round((correct / graded.length) * 100),
    };
  }).filter((d) => d.attempts > 0);
}

// ---- Study mode + question provenance -------------------------------------
export interface CategoryStat {
  key: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

function categoryBreakdown(
  attempts: readonly GradedAttempt[],
  keyOf: (attempt: GradedAttempt) => string,
): CategoryStat[] {
  const groups = new Map<string, { attempts: number; correct: number }>();
  for (const attempt of attempts) {
    if (attempt.correct === null) continue;
    const key = keyOf(attempt);
    const group = groups.get(key) ?? { attempts: 0, correct: 0 };
    group.attempts += 1;
    if (attempt.correct) group.correct += 1;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      ...value,
      accuracy: Math.round((value.correct / value.attempts) * 100),
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

export function studyModeBreakdown(
  quizResults: QuizResultList,
  progress: ProgressMap,
  meta: ChapterMetaMap,
): CategoryStat[] {
  return categoryBreakdown(collectAttempts(quizResults, progress, meta).attempts, (attempt) =>
    attempt.source === 'quiz' ? 'Quiz' : 'Learning',
  );
}

export function originBreakdown(
  quizResults: QuizResultList,
  progress: ProgressMap,
  meta: ChapterMetaMap,
): CategoryStat[] {
  return categoryBreakdown(collectAttempts(quizResults, progress, meta).attempts, (attempt) => {
    if (!attempt.origin) return 'Unclassified';
    const kind = questionOriginKind(attempt.origin);
    return kind === 'other' ? 'Other' : kind.toUpperCase();
  });
}
