import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Icon, Tabs } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { BarChart } from '../../components/statistics/BarChart';
import { ScopeFilter } from '../../components/statistics/ScopeFilter';
import { StatTile } from '../../components/statistics/StatTile';
import { subjectStyle } from '../../constants/subjects';
import { useUserData } from '../../context/UserDataContext';
import { useLibrary } from '../../hooks/useChapters';
import type { NudgeKind, ProgressMap } from '../../types';
import { loadNudgeAnalytics, type NudgeAnalyticsData, type NudgeInteractionRecord } from '../../services/nudges';
import { useAuth } from '../../context/AuthContext';
import {
  accuracyTrend,
  chapterAnalytics,
  computeOverview,
  dailyActivity,
  type ChapterMetaMap,
} from '../../utils/analytics';
import { humanizeDuration } from '../../utils/time';
import styles from './Statistics.module.css';
import { Routes } from '../../constants/routes';

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'all';
type QuestionView = 'all' | 'weak' | 'mastered' | 'skipped';
type QuestionSort = 'attempts' | 'wrong' | 'accuracy' | 'reviews' | 'recent';
type AnalyticsTab = 'overview' | 'questions' | 'nudges';

function startOfRange(range: TimeRange, now = new Date()): number {
  if (range === 'all') return 0;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  } else if (range === 'month') {
    start.setDate(1);
  } else if (range === 'year') {
    start.setMonth(0, 1);
  }
  return start.getTime();
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
  all: 'All time',
};

interface QuestionStat {
  questionId: string;
  chapterId: string;
  statement: string;
  attempts: number;
  correct: number;
  skipped: number;
  timeMs: number;
  lastAt: number;
  reviews30d: number;
  outcomes: Array<{ at: number; value: boolean | null }>;
  tags: string[];
  difficulty?: string;
  origin?: string;
}

export function Statistics() {
  const { quizResults, progress, annotations, questionAttemptLog } = useUserData();
  const { status: authStatus } = useAuth();
  const library = useLibrary();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionView, setQuestionView] = useState<QuestionView>('all');
  const [questionDifficulty, setQuestionDifficulty] = useState('all');
  const [questionSource, setQuestionSource] = useState('all');
  const [questionMinAttempts, setQuestionMinAttempts] = useState(1);
  const [questionSort, setQuestionSort] = useState<QuestionSort>('attempts');
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('overview');
  const [questionPage, setQuestionPage] = useState(1);
  const [nudgeData, setNudgeData] = useState<NudgeAnalyticsData>({ nudges: [], interactions: [] });
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [nudgeError, setNudgeError] = useState('');
  const deferredQuestionSearch = useDeferredValue(questionSearch);

  useEffect(() => {
    if (authStatus !== 'authenticated') { setNudgeData({ nudges: [], interactions: [] }); return; }
    setNudgeLoading(true); setNudgeError('');
    void loadNudgeAnalytics().then(setNudgeData).catch((error) => setNudgeError(error instanceof Error ? error.message : 'Could not load Memory Nudge analytics.')).finally(() => setNudgeLoading(false));
  }, [authStatus]);

  const summaries = useMemo(
    () => library.status === 'success' ? library.data : [],
    [library],
  );

  const meta = useMemo<ChapterMetaMap>(() => {
    const map: ChapterMetaMap = {};
    for (const s of summaries) {
      map[s.id] = {
        id: s.id,
        title: s.title,
        subject: s.subject,
        totalQuestions: s.prelimsCount + s.mainsCount,
      };
    }
    return map;
  }, [summaries]);

  const scopeChapters = useMemo(
    () => summaries.map((s) => ({ id: s.id, title: s.title, subject: s.subject })),
    [summaries],
  );

  // Filter the source data to the selected scope (empty = all).
  const { fQuiz, fProgress } = useMemo(() => {
    const cutoff = startOfRange(timeRange);
    const filteredProgress: ProgressMap = {};
    for (const [id, p] of Object.entries(progress)) {
      if (selected.size > 0 && !selected.has(id)) continue;
      const attempts = Object.fromEntries(
        Object.entries(p.attempts).filter(([, attempt]) => attempt.attemptedAt >= cutoff),
      );
      if (Object.keys(attempts).length > 0) filteredProgress[id] = { ...p, attempts };
    }
    return {
      fQuiz: quizResults.filter(
        (result) =>
          result.takenAt >= cutoff && (selected.size === 0 || selected.has(result.chapterId)),
      ),
      fProgress: filteredProgress,
    };
  }, [selected, timeRange, quizResults, progress]);

  const overview = useMemo(
    () => computeOverview(fQuiz, fProgress, annotations, meta),
    [fQuiz, fProgress, annotations, meta],
  );
  const trend = useMemo(() => accuracyTrend(fQuiz), [fQuiz]);
  const activityDays = useMemo(() => {
    if (timeRange !== 'all') {
      return Math.max(1, Math.floor((Date.now() - startOfRange(timeRange)) / 86_400_000) + 1);
    }
    const timestamps = [
      ...fQuiz.map((result) => result.takenAt),
      ...Object.values(fProgress).flatMap((chapter) =>
        Object.values(chapter.attempts).map((attempt) => attempt.attemptedAt),
      ),
    ];
    if (timestamps.length === 0) return 7;
    const first = Math.min(...timestamps);
    return Math.max(7, Math.ceil((Date.now() - first) / (24 * 60 * 60 * 1000)) + 1);
  }, [fProgress, fQuiz, timeRange]);
  const activity = useMemo(
    () => dailyActivity(fQuiz, fProgress, meta, activityDays),
    [activityDays, fQuiz, fProgress, meta],
  );
  const chapterStats = useMemo(
    () => chapterAnalytics(fQuiz, fProgress, meta),
    [fQuiz, fProgress, meta],
  );
  const dailyQuizResults = useMemo(() => {
    const cutoff = startOfRange(timeRange);
    return quizResults
      .filter((result) => {
        if (result.takenAt < cutoff) return false;
        if (result.purpose !== 'daily-revision' && result.chapterId !== 'daily-revision') return false;
        return selected.size === 0 || result.perQuestion?.some((item) => selected.has(item.chapterId ?? ''));
      })
      .sort((left, right) => right.takenAt - left.takenAt);
  }, [quizResults, selected, timeRange]);
  const questionStats = useMemo(() => {
    const cutoff = startOfRange(timeRange);
    const monthCutoff = Date.now() - 30 * 86_400_000;
    const stats = new Map<string, QuestionStat>();
    for (const result of quizResults) {
      if (result.takenAt < cutoff) continue;
      for (const item of result.perQuestion ?? []) {
        const chapterId = item.chapterId ?? result.chapterId;
        if (selected.size > 0 && !selected.has(chapterId)) continue;
        const key = `${chapterId}:${item.questionId}`;
        const current = stats.get(key) ?? {
          questionId: item.questionId, chapterId, statement: item.questionStatement ?? item.questionId,
          attempts: 0, correct: 0, skipped: 0, timeMs: 0, lastAt: 0, reviews30d: 0,
          outcomes: [], tags: [], difficulty: item.difficulty, origin: item.origin,
        };
        current.attempts += 1;
        current.correct += item.correct === true ? 1 : 0;
        current.skipped += item.correct === null ? 1 : 0;
        current.timeMs += item.timeMs;
        current.lastAt = Math.max(current.lastAt, result.takenAt);
        current.reviews30d += result.takenAt >= monthCutoff ? 1 : 0;
        current.outcomes.push({ at: result.takenAt, value: item.correct });
        current.tags = [...new Set([...current.tags, ...(item.tags ?? [])])];
        current.difficulty = item.difficulty ?? current.difficulty;
        current.origin = item.origin ?? current.origin;
        if (item.questionStatement) current.statement = item.questionStatement;
        stats.set(key, current);
      }
    }
    for (const attempt of questionAttemptLog) {
      if (attempt.type !== 'prelims') continue;
      if (attempt.attemptedAt < cutoff) continue;
      if (selected.size > 0 && !selected.has(attempt.chapterId)) continue;
      const key = `${attempt.chapterId}:${attempt.questionId}`;
      const current = stats.get(key) ?? {
        questionId: attempt.questionId, chapterId: attempt.chapterId, statement: attempt.questionText ?? attempt.questionId,
        attempts: 0, correct: 0, skipped: 0, timeMs: 0, lastAt: 0, reviews30d: 0,
        outcomes: [], tags: [], difficulty: attempt.difficulty, origin: attempt.origin,
      };
      current.attempts += 1;
      current.correct += attempt.correct === true ? 1 : 0;
      current.skipped += attempt.correct === undefined ? 1 : 0;
      current.timeMs += attempt.timeMs ?? 0;
      current.lastAt = Math.max(current.lastAt, attempt.attemptedAt);
      current.reviews30d += attempt.attemptedAt >= monthCutoff ? 1 : 0;
      current.outcomes.push({ at: attempt.attemptedAt, value: attempt.correct ?? null });
      current.tags = [...new Set([...current.tags, ...(attempt.questionTags ?? [])])];
      current.difficulty = attempt.difficulty ?? current.difficulty;
      current.origin = attempt.origin ?? current.origin;
      if (attempt.questionText) current.statement = attempt.questionText;
      stats.set(key, current);
    }
    const query = deferredQuestionSearch.trim().toLowerCase();
    const metric = (item: (typeof stats extends Map<string, infer T> ? T : never)) => {
      const answered = item.attempts - item.skipped;
      const accuracy = answered ? Math.round(item.correct / answered * 100) : 0;
      const wrong = answered - item.correct;
      let streak = 0;
      const chronological = item.outcomes.slice().sort((a, b) => a.at - b.at);
      for (let index = chronological.length - 1; index >= 0 && chronological[index].value === true; index -= 1) streak += 1;
      return { accuracy, wrong, streak };
    };
    return [...stats.values()]
      .filter((item) => {
        const values = metric(item);
        if (item.attempts < questionMinAttempts) return false;
        if (questionDifficulty !== 'all' && item.difficulty !== questionDifficulty) return false;
        if (questionSource === 'pyq' && !item.origin?.toUpperCase().startsWith('PYQ')) return false;
        if (questionSource === 'practice' && item.origin?.toUpperCase().startsWith('PYQ')) return false;
        if (questionView === 'weak' && !(values.accuracy < 60 || values.wrong >= 2)) return false;
        if (questionView === 'mastered' && !(values.accuracy >= 80 && values.streak >= 3)) return false;
        if (questionView === 'skipped' && item.skipped === 0) return false;
        return !query || `${item.statement} ${item.questionId} ${meta[item.chapterId]?.title ?? ''} ${item.tags.join(' ')}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const left = metric(a); const right = metric(b);
        if (questionSort === 'wrong') return right.wrong - left.wrong || b.attempts - a.attempts;
        if (questionSort === 'accuracy') return left.accuracy - right.accuracy || b.attempts - a.attempts;
        if (questionSort === 'reviews') return b.reviews30d - a.reviews30d || b.attempts - a.attempts;
        if (questionSort === 'recent') return b.lastAt - a.lastAt;
        return b.attempts - a.attempts || b.lastAt - a.lastAt;
      });
  }, [deferredQuestionSearch, meta, questionAttemptLog, questionDifficulty, questionMinAttempts, questionSort, questionSource, questionView, quizResults, selected, timeRange]);

  useEffect(() => setQuestionPage(1), [questionDifficulty, questionMinAttempts, questionSearch, questionSort, questionSource, questionView, selected, timeRange]);
  const questionPageSize = 25;
  const questionPageCount = Math.max(1, Math.ceil(questionStats.length / questionPageSize));
  const visibleQuestionPage = Math.min(questionPage, questionPageCount);
  const visibleQuestionStats = questionStats.slice(
    (visibleQuestionPage - 1) * questionPageSize,
    visibleQuestionPage * questionPageSize,
  );

  const hasAnyActivity = quizResults.length > 0 || Object.keys(progress).length > 0 || nudgeData.nudges.length > 0 || nudgeData.interactions.length > 0;
  const scopeHasData = overview.answered > 0 || overview.quizzes > 0 || overview.chaptersRevised > 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Statistics"
        title="Your progress"
        description="A focused view of your daily activity, accuracy and study time."
      />

      {!hasAnyActivity ? (
        <EmptyState
          icon="chart"
          title="No data yet"
          description="Take a quiz or revise a few questions and your analytics will build up here."
        />
      ) : (
        <>
          <section className={styles.filters} aria-label="Analytics filters">
            <div className={styles.filterHead}>
              <div>
                <strong>{analyticsTab === 'nudges' ? 'Filter nudge activity' : 'Filter your statistics'}</strong>
                <span>{analyticsTab === 'nudges' ? 'The date range applies to deliveries, opens and feedback. Saved-content totals remain current.' : 'The range and chapter selection apply to everything below.'}</span>
              </div>
              <div className={styles.timeOptions} aria-label="Analytics time range">
              {([
                ['today', 'Today'],
                ['week', 'This week'],
                ['month', 'This month'],
                ['year', 'This year'],
                ['all', 'All time'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={timeRange === value ? styles.timeActive : styles.timeButton}
                  aria-pressed={timeRange === value}
                  onClick={() => setTimeRange(value)}
                >
                  {label}
                </button>
              ))}
              </div>
            </div>

            {analyticsTab !== 'nudges' && scopeChapters.length > 0 && (
              <ScopeFilter chapters={scopeChapters} selected={selected} onChange={setSelected} />
            )}
          </section>

          <div className={styles.analyticsTabs}>
            <Tabs
              aria-label="Analytics sections"
              items={[{ id: 'overview', label: 'Overview' }, { id: 'questions', label: 'Questions' }, { id: 'nudges', label: 'Memory Nudges' }]}
              value={analyticsTab}
              onChange={setAnalyticsTab}
            />
          </div>

          {analyticsTab === 'nudges' ? (
            <NudgeAnalytics data={nudgeData} range={timeRange} loading={nudgeLoading} error={nudgeError} />
          ) : analyticsTab === 'questions' ? (
            <QuestionAnalytics
              items={visibleQuestionStats}
              total={questionStats.length}
              page={visibleQuestionPage}
              pageCount={questionPageCount}
              search={questionSearch}
              view={questionView}
              difficulty={questionDifficulty}
              source={questionSource}
              minAttempts={questionMinAttempts}
              sort={questionSort}
              meta={meta}
              onSearch={setQuestionSearch}
              onView={setQuestionView}
              onDifficulty={setQuestionDifficulty}
              onSource={setQuestionSource}
              onMinAttempts={setQuestionMinAttempts}
              onSort={setQuestionSort}
              onPage={setQuestionPage}
              onClear={() => {
                setQuestionSearch('');
                setQuestionView('all');
                setQuestionDifficulty('all');
                setQuestionSource('all');
                setQuestionMinAttempts(1);
                setQuestionSort('attempts');
              }}
            />
          ) : !scopeHasData ? (
            <EmptyState
              icon="chart"
              title="No activity in this selection"
              description="Try a different chapter or subject, or clear the filter."
            />
          ) : (
            <>
              <div className={styles.primaryTiles}>
                <StatTile
                  icon="target"
                  label="Accuracy"
                  value={`${overview.accuracy}%`}
                  sublabel={`${overview.correct}/${overview.answered} correct`}
                />
                <StatTile icon="check" label="Questions answered" value={String(overview.answered)} />
                <StatTile
                  icon="clock"
                  label="Time studied"
                  value={humanizeDuration(overview.timeStudiedMs)}
                />
              </div>

              <div className={styles.secondaryMetrics} aria-label="Additional statistics">
                <CompactMetric value={String(overview.quizzes)} label="Quizzes" />
                <CompactMetric
                  value={overview.avgTimePerQuestionMs
                    ? humanizeDuration(overview.avgTimePerQuestionMs)
                    : '—'}
                  label="Average per question"
                />
                <CompactMetric
                  value={`${overview.currentStreak}d`}
                  label="Current streak"
                  detail={`Best ${overview.longestStreak}d`}
                />
                <CompactMetric value={String(overview.activeDays)} label="Active days" />
                <CompactMetric value={String(overview.chaptersRevised)} label="Chapters revised" />
              </div>

              <div className={styles.charts}>
                <section className={`${styles.card} ${styles.activityCard}`}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>Daily activity</h2>
                    <span className={styles.cardHint}>
                      Questions · {TIME_RANGE_LABELS[timeRange].toLowerCase()}
                    </span>
                  </div>
                  <BarChart
                    data={activity.map((d) => ({
                      label: d.label,
                      value: d.questions,
                      tooltip: `${new Date(d.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${d.questions} question${d.questions === 1 ? '' : 's'} · ${humanizeDuration(d.timeMs)}`,
                    }))}
                  />
                </section>

                {trend.length > 1 && (
                  <section className={styles.card}>
                    <div className={styles.cardHead}>
                      <h2 className={styles.cardTitle}>Accuracy over time</h2>
                      <span className={styles.cardHint}>Last {trend.length} quizzes</span>
                    </div>
                    <BarChart
                      data={trend.map((t) => ({
                        label: t.label,
                        value: t.accuracy,
                        tooltip: `${t.label}: ${t.correct}/${t.total} · ${t.accuracy}%`,
                      }))}
                      max={100}
                      valueSuffix="%"
                      gridValues={[0, 50, 100]}
                    />
                  </section>
                )}
              </div>

              {dailyQuizResults.length > 0 && (
                <section className={`${styles.card} ${styles.standaloneCard}`}>
                  <div className={styles.cardHead}>
                    <div><h2 className={styles.cardTitle}>Daily Revision history</h2><span className={styles.cardHint}>Every completed attempt remains reviewable, including reattempts</span></div>
                    <span className={styles.dailyCompleteBadge}>{dailyQuizResults.length} {dailyQuizResults.length === 1 ? 'attempt' : 'attempts'}</span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Date</th><th className={styles.num}>Score</th><th className={styles.num}>Accuracy</th><th className={styles.num}>Questions</th><th className={styles.num}>Time</th><th aria-label="Review" /></tr></thead>
                      <tbody>{dailyQuizResults.slice(0, 30).map((result) => {
                        const date = result.dailyDateKey ? new Date(`${result.dailyDateKey}T12:00:00`) : new Date(result.takenAt);
                        const accuracy = result.answered ? Math.round((result.correct / result.answered) * 100) : 0;
                        const resultDay = result.dailyDateKey ?? new Date(result.takenAt).toLocaleDateString('en-CA');
                        const sameDay = dailyQuizResults.filter((item) => (item.dailyDateKey ?? new Date(item.takenAt).toLocaleDateString('en-CA')) === resultDay);
                        const attemptNumber = sameDay.filter((item) => item.takenAt <= result.takenAt).length;
                        return <tr key={result.id}>
                          <td><span className={styles.dailyDate}><b>✓</b><span><strong>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date)}</strong><small>Attempt {attemptNumber} of {sameDay.length} · {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(result.takenAt)}</small></span></span></td>
                          <td className={styles.num}>{result.correct}/{result.totalQuestions}</td>
                          <td className={styles.num}>{accuracy}%</td>
                          <td className={styles.num}>{result.totalQuestions}</td>
                          <td className={styles.num}>{humanizeDuration(result.durationMs)}</td>
                          <td className={styles.num}><Link className={styles.reviewLink} to={Routes.quizResult(result.id)}>Review</Link></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                  {dailyQuizResults.length > 30 && <p className={styles.tableNote}>Showing the latest 30 of {dailyQuizResults.length} dated Daily Revision attempts.</p>}
                </section>
              )}

              {chapterStats.length > 1 && (
                <section className={`${styles.card} ${styles.standaloneCard}`}>
                  <div className={styles.cardHead}>
                    <div>
                      <h2 className={styles.cardTitle}>Performance by original chapter</h2>
                      <span className={styles.cardHint}>Mixed and Daily Revision questions are credited to the chapter they came from. Totals include every non-deleted practice and quiz attempt.</span>
                    </div>
                    <span className={styles.cardHint}>{chapterStats.length} chapters</span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Chapter</th>
                          <th className={styles.num} title="Times questions from this chapter appeared across your attempts">Questions shown</th>
                          <th className={styles.num} title="Correct answers out of answered questions">Your result</th>
                          <th className={styles.num}>Avg time</th>
                          <th className={styles.num} title="Unique questions seen out of all questions in this chapter">Bank seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chapterStats.map((c) => (
                          <tr key={c.chapterId}>
                            <td>
                              <span className={styles.chapterCell}>
                                <span
                                  className={styles.subjectDot}
                                  style={{
                                    backgroundColor: `hsl(${subjectStyle(c.subject).hue} 60% 55%)`,
                                  }}
                                />
                                {c.title}
                              </span>
                            </td>
                            <td className={styles.num}>{c.shown}</td>
                            <td className={styles.num}><span className={styles.chapterResult}><strong>{c.correct}/{c.attempts}</strong><small>{c.attempts > 0 ? `${c.accuracy}% accuracy` : 'All skipped'}</small></span></td>
                            <td className={styles.num}>
                              {c.avgTimeMs ? humanizeDuration(c.avgTimeMs) : '—'}
                            </td>
                            <td className={styles.num}><span className={styles.chapterResult}><strong>{c.uniqueQuestions}/{c.totalQuestions}</strong><small>{c.coverage}% coverage</small></span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

            </>
          )}
        </>
      )}
    </Page>
  );
}

function NudgeAnalytics({ data, range, loading, error }: { data: NudgeAnalyticsData; range: TimeRange; loading: boolean; error: string }) {
  const cutoff = startOfRange(range);
  const interactions = data.interactions.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
  const productionDeliveries = interactions.filter((item) => item.action === 'delivered' && item.metadata.test !== true);
  const testDeliveries = interactions.filter((item) => item.action === 'delivered' && item.metadata.test === true);
  const opened = interactions.filter((item) => item.action === 'opened');
  const remembered = interactions.filter((item) => item.action === 'remembered');
  const forgotten = interactions.filter((item) => item.action === 'forgot');
  const snoozed = interactions.filter((item) => item.action === 'snooze');
  const responses = remembered.length + forgotten.length;
  const recallRate = responses ? Math.round(remembered.length / responses * 100) : 0;
  const current = data.nudges.filter((item) => !item.archived);
  const active = current.filter((item) => item.active);
  const ready = active.filter((item) => !item.nextEligibleAt || new Date(item.nextEligibleAt).getTime() <= Date.now());
  const neverDelivered = active.filter((item) => item.sendCount === 0);
  const byId = new Map(data.nudges.map((item) => [item.id, item]));
  const kinds: NudgeKind[] = ['fact', 'data', 'quote', 'definition', 'mistake', 'reminder'];
  const categoryRows = kinds.map((kind) => {
    const saved = current.filter((item) => item.kind === kind).length;
    const matching = (item: NudgeInteractionRecord) => byId.get(item.nudgeId)?.kind === kind;
    const deliveries = productionDeliveries.filter(matching).length;
    const reviews = opened.filter(matching).length;
    const rememberedCount = remembered.filter(matching).length;
    const forgottenCount = forgotten.filter(matching).length;
    const decisions = rememberedCount + forgottenCount;
    return { kind, saved, deliveries, reviews, remembered: rememberedCount, forgotten: forgottenCount, recall: decisions ? Math.round(rememberedCount / decisions * 100) : null };
  }).filter((row) => row.saved > 0 || row.deliveries > 0 || row.reviews > 0);
  const needsAttention = current.filter((item) => item.forgottenCount > 0).sort((a, b) => (b.forgottenCount - b.rememberedCount) - (a.forgottenCount - a.rememberedCount) || b.priority - a.priority).slice(0, 5);
  const recent = interactions.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12);
  const actionLabel: Record<string, string> = { delivered: 'Delivered', opened: 'Opened for review', remembered: 'Remembered', forgot: 'Forgotten', snooze: 'Snoozed', archive: 'Archived' };

  if (loading) return <section className={`${styles.card} ${styles.nudgeLoading}`} aria-busy='true'><span /><div><h2 className={styles.cardTitle}>Loading Memory Nudge analytics</h2><p className={styles.cardHint}>Calculating retention and delivery signals…</p></div></section>;
  if (error) return <EmptyState icon='chart' title='Could not load nudge analytics' description={error} />;
  if (!data.nudges.length && !data.interactions.length) return <EmptyState icon='sparkle' title='No Memory Nudge data yet' description='Add your first nudge and its delivery and retention signals will appear here.' action={<Link className={styles.reviewLink} to={Routes.nudges}>Create a nudge</Link>} />;

  return <section className={styles.nudgeAnalytics}>
    <div className={styles.primaryTiles}>
      <StatTile icon='sparkle' label='Saved nudges' value={String(current.length)} sublabel={`${active.length} active`} />
      <StatTile icon='share' label='Real deliveries' value={String(productionDeliveries.length)} sublabel={TIME_RANGE_LABELS[range]} />
      <StatTile icon='check' label='Recall signal' value={responses ? `${recallRate}%` : '—'} sublabel={responses ? `${remembered.length}/${responses} remembered` : 'No feedback yet'} />
    </div>
    <div className={styles.secondaryMetrics} aria-label='Memory Nudge operational statistics'>
      <CompactMetric value={String(ready.length)} label='Ready to send' detail={`${active.length} active`} />
      <CompactMetric value={String(neverDelivered.length)} label='Never delivered' />
      <CompactMetric value={String(opened.length)} label='Reviews opened' detail='App + notification views' />
      <CompactMetric value={String(snoozed.length)} label='Snoozed' />
      <CompactMetric value={String(testDeliveries.length)} label='Test deliveries' detail='Excluded from real totals' />
    </div>

    <div className={styles.nudgeGrid}>
      <section className={styles.card}>
        <div className={styles.cardHead}><div><h2 className={styles.cardTitle}>Retention by category</h2><span className={styles.cardHint}>Use this to find content types that are being forgotten—not merely delivered.</span></div></div>
        {categoryRows.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Type</th><th className={styles.num}>Saved</th><th className={styles.num}>Delivered</th><th className={styles.num}>Reviews</th><th className={styles.num}>Remembered</th><th className={styles.num}>Forgotten</th><th className={styles.num}>Recall</th></tr></thead><tbody>{categoryRows.map((row) => <tr key={row.kind}><td className={styles.nudgeKind}>{row.kind}</td><td className={styles.num}>{row.saved}</td><td className={styles.num}>{row.deliveries}</td><td className={styles.num}>{row.reviews}</td><td className={styles.num}>{row.remembered}</td><td className={styles.num}>{row.forgotten}</td><td className={styles.num}>{row.recall === null ? '—' : `${row.recall}%`}</td></tr>)}</tbody></table></div> : <p className={styles.cardHint}>No category activity in this period.</p>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}><div><h2 className={styles.cardTitle}>Needs attention</h2><span className={styles.cardHint}>Items with recorded “forgot” feedback, ordered by the strongest difficulty signal.</span></div></div>
        {needsAttention.length ? <ol className={styles.attentionList}>{needsAttention.map((nudge) => <li key={nudge.id}><Link to={`${Routes.nudges}?id=${nudge.id}`}><span><strong>{nudge.title}</strong><small>{nudge.kind} · priority {nudge.priority}</small></span><b>{nudge.forgottenCount} forgot</b></Link></li>)}</ol> : <div className={styles.healthyState}><Icon name='check' size={18} /><span>No forgotten items recorded yet.</span></div>}
      </section>
    </div>

    <section className={`${styles.card} ${styles.standaloneCard}`}>
      <div className={styles.cardHead}><div><h2 className={styles.cardTitle}>Recent nudge activity</h2><span className={styles.cardHint}>A transparent audit of delivery and review events. Test deliveries are clearly marked.</span></div><span className={styles.cardHint}>{TIME_RANGE_LABELS[range]}</span></div>
      {recent.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Activity</th><th>Nudge</th><th className={styles.num}>When</th></tr></thead><tbody>{recent.map((item) => { const nudge = byId.get(item.nudgeId); return <tr key={item.id}><td><span className={`${styles.activityPill} ${item.action === 'forgot' ? styles.activityDanger : ''}`}>{actionLabel[item.action] ?? item.action}{item.metadata.test === true ? ' · test' : ''}</span></td><td>{nudge ? <Link className={styles.nudgeTitleLink} to={`${Routes.nudges}?id=${nudge.id}`}>{nudge.title}</Link> : 'Deleted nudge'}</td><td className={styles.num}>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt))}</td></tr>; })}</tbody></table></div> : <p className={styles.cardHint}>No nudge activity in this date range.</p>}
    </section>
  </section>;
}

function QuestionAnalytics({
  items, total, page, pageCount, search, view, difficulty, source, minAttempts, sort, meta,
  onSearch, onView, onDifficulty, onSource, onMinAttempts, onSort, onPage, onClear,
}: {
  items: QuestionStat[];
  total: number;
  page: number;
  pageCount: number;
  search: string;
  view: QuestionView;
  difficulty: string;
  source: string;
  minAttempts: number;
  sort: QuestionSort;
  meta: ChapterMetaMap;
  onSearch: (value: string) => void;
  onView: (value: QuestionView) => void;
  onDifficulty: (value: string) => void;
  onSource: (value: string) => void;
  onMinAttempts: (value: number) => void;
  onSort: (value: QuestionSort) => void;
  onPage: (value: number) => void;
  onClear: () => void;
}) {
  return (
    <section className={`${styles.card} ${styles.questionAnalytics}`}>
      <div className={styles.questionAnalyticsHead}>
        <div>
          <h2 className={styles.cardTitle}>Question analytics</h2>
          <span className={styles.cardHint}>{total} matching practiced question{total === 1 ? '' : 's'} · 25 per page</span>
        </div>
        <label className={styles.questionSearch}>
          <span>Search question, chapter or tag</span>
          <input aria-label="Search question analytics" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Type words from a question…" />
        </label>
      </div>

      <div className={styles.questionFilters}>
        <fieldset className={styles.performanceFilter}>
          <legend>Performance</legend>
          <div className={styles.questionViews}>{([
            ['all', 'All practiced', 'Every question attempted in the selected period.'],
            ['weak', 'Needs attention', 'Below 60% accuracy or answered incorrectly at least twice.'],
            ['mastered', 'Mastered', 'At least 80% accuracy with three consecutive correct answers.'],
            ['skipped', 'Skipped', 'Questions skipped at least once.'],
          ] as const).map(([value, label, explanation]) => <button key={value} type="button" title={explanation} className={view === value ? styles.questionViewActive : styles.questionView} onClick={() => onView(value)}>{label}</button>)}</div>
          <small>{view === 'weak' ? 'Below 60% accuracy or wrong 2+ times.' : view === 'mastered' ? '80%+ accuracy and a 3-answer correct streak.' : view === 'skipped' ? 'Skipped at least once.' : 'All questions you have practiced.'}</small>
        </fieldset>
        <label><span>Difficulty</span><select value={difficulty} onChange={(event) => onDifficulty(event.target.value)}><option value="all">Any difficulty</option><option value="easy">Easy only</option><option value="medium">Medium only</option><option value="hard">Hard only</option></select><small>Uses question-bank metadata.</small></label>
        <label><span>Question source</span><select value={source} onChange={(event) => onSource(event.target.value)}><option value="all">Any source</option><option value="pyq">Previous-year questions</option><option value="practice">Practice questions</option></select><small>PYQ or practice material.</small></label>
        <label><span>Practice count</span><select value={minAttempts} onChange={(event) => onMinAttempts(Number(event.target.value))}>{[1, 2, 3, 5, 10].map((value) => <option key={value} value={value}>Attempted {value}+ time{value === 1 ? '' : 's'}</option>)}</select><small>Minimum recorded attempts.</small></label>
        <label><span>Order results</span><select value={sort} onChange={(event) => onSort(event.target.value as QuestionSort)}><option value="attempts">Most attempted first</option><option value="wrong">Most incorrect first</option><option value="accuracy">Lowest accuracy first</option><option value="reviews">Most reviewed this month</option><option value="recent">Most recently reviewed</option></select><small>Changes order, not matches.</small></label>
      </div>

      {items.length === 0 ? (
        <div className={styles.questionEmpty}>
          <EmptyState
            icon="search"
            title="No questions match these filters"
            description="Your analytics are still here. Clear the question filters or broaden the date and chapter selection above."
            action={<Button variant="secondary" onClick={onClear}>Clear question filters</Button>}
          />
        </div>
      ) : (
        <ol className={styles.questionList} start={(page - 1) * 25 + 1}>
          {items.map((item) => {
            const answered = item.attempts - item.skipped;
            const accuracy = answered ? Math.round(item.correct / answered * 100) : 0;
            const wrong = answered - item.correct;
            let streak = 0;
            const chronological = item.outcomes.slice().sort((a, b) => a.at - b.at);
            for (let index = chronological.length - 1; index >= 0 && chronological[index].value === true; index -= 1) streak += 1;
            return (
              <li key={`${item.chapterId}:${item.questionId}`} className={styles.questionItem}>
                <div className={styles.questionMain}>
                  <Link className={styles.questionStatement} to={`${Routes.chapter(item.chapterId)}?tab=prelims#question-${encodeURIComponent(item.questionId)}`}>{item.statement}</Link>
                  <div className={styles.questionContext}>
                    <span>{meta[item.chapterId]?.title ?? item.chapterId}</span>
                    {item.difficulty && <span>{item.difficulty}</span>}
                    {item.origin && <span>{item.origin}</span>}
                  </div>
                  {item.tags.length > 0 && <div className={styles.tagList}>{item.tags.slice(0, 6).map((tag) => <em key={tag}>{tag}</em>)}{item.tags.length > 6 && <small>+{item.tags.length - 6}</small>}</div>}
                </div>
                <dl className={styles.questionMetrics}>
                  <div><dt>Accuracy</dt><dd className={accuracy < 60 ? styles.metricDanger : undefined}>{accuracy}%</dd></div>
                  <div><dt>Attempts</dt><dd>{item.attempts}</dd></div>
                  <div><dt>Wrong</dt><dd className={wrong > 0 ? styles.metricDanger : undefined}>{wrong}</dd></div>
                  <div><dt>Correct streak</dt><dd>{streak}</dd></div>
                  <div><dt>Skipped</dt><dd>{item.skipped}</dd></div>
                  <div><dt>Average time</dt><dd>{item.attempts ? humanizeDuration(item.timeMs / item.attempts) : '—'}</dd></div>
                  <div><dt>Reviews · 30 days</dt><dd>{item.reviews30d}</dd></div>
                  <div><dt>Last reviewed</dt><dd>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(item.lastAt)}</dd></div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}

      {total > 0 && (
        <nav className={styles.pagination} aria-label="Question analytics pages">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
          <span>Page <strong>{page}</strong> of {pageCount} · {total} questions</span>
          <Button variant="secondary" size="sm" disabled={page === pageCount} onClick={() => onPage(page + 1)}>Next</Button>
        </nav>
      )}
    </section>
  );
}

function CompactMetric({ value, label, detail }: {
  value: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className={styles.compactMetric}>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}
