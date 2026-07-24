import type {
  RevisionCandidate,
  RevisionContext,
  RevisionQuery,
  RevisionQueue,
  RevisionRecommendation,
} from '../../types';
import { annotationKey } from '../../utils/annotations';

const MS_DAY = 86_400_000;
const MINUTES_PER_QUESTION = 1.25;
const MAX_LIMIT = 100;

interface Outcome { at: number; correct: boolean | null }
interface Schedule { level: number; dueAt: number | null }

/** Pure, UI-independent spaced-repetition scheduler. */
export class RevisionEngine {
  generate(
    candidates: readonly RevisionCandidate[],
    context: RevisionContext,
    query: RevisionQuery,
  ): RevisionQueue {
    const now = query.now ?? Date.now();
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(query.limit)));
    const included = new Set(query.includedChapterIds);
    const subjects = query.subjects?.length ? new Set(query.subjects) : null;
    const history = buildHistory(context);
    const intervalMultiplier = examIntervalMultiplier(daysUntil(query.examDate, now));
    const enrolled = candidates.filter(({ chapter }) =>
      included.has(chapter.id) && (!subjects || subjects.has(chapter.subject)));

    const evaluated = enrolled.map((candidate) =>
      evaluate(candidate, context, history, now, intervalMultiplier, query));
    const due = evaluated
      .filter((item) => item.kind === 'due')
      .sort((a, b) => b.score - a.score || (a.dueAt ?? 0) - (b.dueAt ?? 0));
    const unseen = evaluated
      .filter((item) => item.kind === 'new')
      .sort((a, b) => b.score - a.score || a.question.id.localeCompare(b.question.id));
    const scheduled = evaluated
      .filter((item) => item.kind === 'scheduled')
      .sort((a, b) => b.score - a.score || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));

    // Due work always wins. New material can only occupy the configured share
    // of otherwise-free capacity, so revision backlog is never displaced.
    const select = query.balanceSubjects ? balanceSubjects : takeFirst;
    const mode = query.selectionMode ?? 'adaptive';
    const dueSelected = mode === 'new' ? [] : select(due, limit);
    const remaining = limit - dueSelected.length;
    const newCap = mode === 'review'
      ? 0
      : mode === 'new' || query.fillDailyCapacity
        ? remaining
        : Math.min(remaining, Math.floor(limit * clamp(query.newQuestionPercent, 0, 100) / 100));
    const newSelected = select(unseen, newCap);
    const scheduledCap = query.includeScheduled && mode !== 'new'
      ? limit - dueSelected.length - newSelected.length
      : 0;
    const scheduledSelected = select(scheduled, scheduledCap);
    const recommendations = [...dueSelected, ...newSelected, ...scheduledSelected];

    return {
      recommendations,
      requestedCount: limit,
      estimatedMinutes: Math.ceil(recommendations.length * MINUTES_PER_QUESTION),
      availableCount: evaluated.length,
      dueCount: dueSelected.length,
      newCount: newSelected.length,
      scheduledCount: scheduledSelected.length,
      totalDueCount: due.length,
      enrolledChapterCount: new Set(enrolled.map((item) => item.chapter.id)).size,
    };
  }
}

function buildHistory(context: RevisionContext): Map<string, Outcome[]> {
  const history = new Map<string, Outcome[]>();
  const push = (key: string, outcome: Outcome) => {
    const items = history.get(key) ?? [];
    if (!items.some((item) => item.at === outcome.at && item.correct === outcome.correct)) items.push(outcome);
    history.set(key, items);
  };
  for (const result of context.quizResults) {
    for (const item of result.perQuestion ?? []) {
      const outcome = { at: result.takenAt, correct: item.correct };
      push(`${item.chapterId ?? result.chapterId}:${item.questionId}`, outcome);
      push(`*:${item.questionId}`, outcome);
    }
  }
  for (const chapter of Object.values(context.progress)) {
    for (const attempt of Object.values(chapter.attempts)) {
      push(`${chapter.chapterId}:${attempt.questionId}`, {
        at: attempt.attemptedAt,
        correct: attempt.correct ?? null,
      });
    }
  }
  for (const attempt of context.questionAttemptLog) {
    push(`${attempt.chapterId}:${attempt.questionId}`, {
      at: attempt.attemptedAt,
      correct: attempt.correct ?? null,
    });
  }
  for (const items of history.values()) items.sort((a, b) => a.at - b.at);
  return history;
}

function evaluate(
  candidate: RevisionCandidate,
  context: RevisionContext,
  history: Map<string, Outcome[]>,
  now: number,
  intervalMultiplier: number,
  query: RevisionQuery,
): RevisionRecommendation {
  const { chapter, question } = candidate;
  const direct = history.get(`${chapter.id}:${question.id}`) ?? [];
  const outcomes = direct.length ? direct : history.get(`*:${question.id}`) ?? [];
  const answered = outcomes.filter((item) => item.correct !== null);
  const correct = answered.filter((item) => item.correct).length;
  const wrong = answered.length - correct;
  const skipped = outcomes.length - answered.length;
  const accuracy = answered.length ? Math.round((correct / answered.length) * 100) : null;
  const schedule = calculateSchedule(outcomes, intervalMultiplier, query);
  const annotation = context.annotations[annotationKey(chapter.id, question.id)];

  if (outcomes.length === 0) {
    return {
      ...candidate,
      score: (query.prioritizeBookmarks && annotation?.bookmarked ? 12 : 0) + (question.difficulty === 'hard' ? 3 : 0),
      reason: annotation?.bookmarked ? 'New · Bookmarked' : 'New from a studied chapter',
      dueAt: null,
      attempts: 0,
      accuracy: null,
      level: 0,
      kind: 'new',
      nextIntervalDays: null,
    };
  }

  const overdueDays = schedule.dueAt === null ? 0 : (now - schedule.dueAt) / MS_DAY;
  const weakness = answered.length ? wrong / answered.length : 1;
  let score = Math.max(0, overdueDays) * 3 + weakness * 30 + skipped * 6;
  if (outcomes.at(-1)?.correct === false) score += 20;
  if (outcomes.at(-1)?.correct === null) score += 16;
  if (query.prioritizeBookmarks && annotation?.bookmarked) score += 10;
  const reasons: string[] = [];
  if (overdueDays >= 1) reasons.push(`${Math.ceil(overdueDays)}d overdue`);
  else reasons.push('Due today');
  if (outcomes.at(-1)?.correct === false) reasons.push('Incorrect last time');
  else if (outcomes.at(-1)?.correct === null) reasons.push('Skipped last time');
  else if (accuracy !== null && accuracy < 60) reasons.push(`${accuracy}% accuracy`);

  return {
    ...candidate,
    score: Math.round(score * 10) / 10,
    reason: reasons.slice(0, 2).join(' · '),
    dueAt: schedule.dueAt,
    attempts: outcomes.length,
    accuracy,
    level: schedule.level,
    kind: schedule.dueAt !== null && schedule.dueAt <= now ? 'due' : 'scheduled',
    nextIntervalDays: schedule.level > 0
      ? query.correctIntervals[Math.min(schedule.level, query.correctIntervals.length - 1)] ?? null
      : null,
  };
}

function calculateSchedule(outcomes: readonly Outcome[], multiplier: number, query: RevisionQuery): Schedule {
  const intervals = query.correctIntervals.length ? query.correctIntervals : [1, 3, 7, 15, 30, 60, 120, 180];
  let level = 0;
  let dueAt: number | null = null;
  for (const outcome of outcomes) {
    if (outcome.correct === true) {
      level = Math.min(level + 1, intervals.length - 1);
      dueAt = outcome.at + Math.max(1, Math.round(intervals[level] * multiplier)) * MS_DAY;
    } else if (outcome.correct === false) {
      level = Math.max(0, level - query.wrongLevelDrop);
      dueAt = outcome.at + Math.max(1, query.wrongReturnDays) * MS_DAY;
    } else {
      level = Math.max(0, level - query.skippedLevelDrop);
      dueAt = outcome.at + Math.max(1, query.skippedReturnDays) * MS_DAY;
    }
  }
  return { level, dueAt };
}

function takeFirst(items: readonly RevisionRecommendation[], limit: number): RevisionRecommendation[] {
  return items.slice(0, limit);
}

function balanceSubjects(items: readonly RevisionRecommendation[], limit: number): RevisionRecommendation[] {
  const groups = new Map<string, RevisionRecommendation[]>();
  for (const item of items) {
    const group = groups.get(item.chapter.subject) ?? [];
    group.push(item);
    groups.set(item.chapter.subject, group);
  }
  const result: RevisionRecommendation[] = [];
  while (result.length < limit) {
    let added = false;
    const ordered = [...groups.values()].sort((a, b) => (b[0]?.score ?? -1) - (a[0]?.score ?? -1));
    for (const group of ordered) {
      const item = group.shift();
      if (!item) continue;
      result.push(item);
      added = true;
      if (result.length === limit) break;
    }
    if (!added) break;
  }
  return result;
}

function examIntervalMultiplier(days: number | null): number {
  if (days === null || days > 90 || days < 0) return 1;
  if (days > 30) return 0.85;
  if (days > 14) return 0.7;
  if (days > 7) return 0.5;
  return 0.35;
}

function daysUntil(date: string | null | undefined, now: number): number | null {
  if (!date) return null;
  const target = new Date(`${date}T23:59:59`).getTime();
  return Number.isFinite(target) ? Math.ceil((target - now) / MS_DAY) : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
