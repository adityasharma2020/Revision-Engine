import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { BarChart } from '../../components/statistics/BarChart';
import { ScopeFilter } from '../../components/statistics/ScopeFilter';
import { StatTile } from '../../components/statistics/StatTile';
import { subjectStyle } from '../../constants/subjects';
import { useUserData } from '../../context/UserDataContext';
import { useLibrary } from '../../hooks/useChapters';
import type { ProgressMap } from '../../types';
import {
  accuracyTrend,
  chapterAnalytics,
  computeOverview,
  dailyActivity,
  type ChapterMetaMap,
} from '../../utils/analytics';
import { humanizeDuration } from '../../utils/time';
import styles from './Statistics.module.css';

type TimeRange = '7d' | '30d' | 'all';

export function Statistics() {
  const { quizResults, progress, annotations } = useUserData();
  const library = useLibrary();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

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
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : null;
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
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
    if (timeRange === '7d') return 7;
    if (timeRange === '30d') return 30;
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

  const hasAnyActivity =
    quizResults.length > 0 || Object.keys(progress).length > 0;
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
                <strong>Filter your statistics</strong>
                <span>The range and chapter selection apply to everything below.</span>
              </div>
              <div className={styles.timeOptions} aria-label="Analytics time range">
              {([
                ['7d', 'Last 7 days'],
                ['30d', 'Last 30 days'],
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

            {scopeChapters.length > 0 && (
              <ScopeFilter chapters={scopeChapters} selected={selected} onChange={setSelected} />
            )}
          </section>

          {!scopeHasData ? (
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
                      Questions · {timeRange === 'all' ? 'all recorded days' : `last ${activityDays} days`}
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

              {chapterStats.length > 1 && (
                <section className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>Chapter breakdown</h2>
                    <span className={styles.cardHint}>{chapterStats.length} chapters</span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Chapter</th>
                          <th className={styles.num}>Accuracy</th>
                          <th className={styles.num}>Attempts</th>
                          <th className={styles.num}>Avg time</th>
                          <th className={styles.num}>Coverage</th>
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
                            <td className={styles.num}>{c.accuracy}%</td>
                            <td className={styles.num}>{c.attempts}</td>
                            <td className={styles.num}>
                              {c.avgTimeMs ? humanizeDuration(c.avgTimeMs) : '—'}
                            </td>
                            <td className={styles.num}>{c.coverage}%</td>
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
