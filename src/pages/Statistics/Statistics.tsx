import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { BarChart } from '../../components/statistics/BarChart';
import { ScopeFilter } from '../../components/statistics/ScopeFilter';
import { StatBreakdown, type BreakdownRow } from '../../components/statistics/StatBreakdown';
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
  difficultyBreakdown,
  originBreakdown,
  studyModeBreakdown,
  subjectAnalytics,
  type ChapterMetaMap,
} from '../../utils/analytics';
import { humanizeDuration } from '../../utils/time';
import styles from './Statistics.module.css';

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

type TimeRange = '7d' | '30d' | 'all';

export function Statistics() {
  const { quizResults, progress, annotations } = useUserData();
  const library = useLibrary();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const summaries = library.status === 'success' ? library.data : [];

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
  const activity = useMemo(() => dailyActivity(fQuiz, fProgress, meta), [fQuiz, fProgress, meta]);
  const chapterStats = useMemo(
    () => chapterAnalytics(fQuiz, fProgress, meta),
    [fQuiz, fProgress, meta],
  );
  const subjectStats = useMemo(() => subjectAnalytics(chapterStats), [chapterStats]);
  const difficulty = useMemo(
    () => difficultyBreakdown(fQuiz, fProgress, meta),
    [fQuiz, fProgress, meta],
  );
  const origins = useMemo(
    () => originBreakdown(fQuiz, fProgress, meta),
    [fQuiz, fProgress, meta],
  );
  const studyModes = useMemo(
    () => studyModeBreakdown(fQuiz, fProgress, meta),
    [fQuiz, fProgress, meta],
  );

  const hasAnyActivity =
    quizResults.length > 0 || Object.keys(progress).length > 0;
  const scopeHasData = overview.answered > 0 || overview.quizzes > 0 || overview.chaptersRevised > 0;

  const subjectRows: BreakdownRow[] = subjectStats.map((s) => ({
    label: subjectStyle(s.subject).label,
    value: s.accuracy,
    max: 100,
    display: `${s.accuracy}%`,
    caption: `${s.attempts} attempts · ${s.chapters} chapter${s.chapters === 1 ? '' : 's'}`,
    hue: subjectStyle(s.subject).hue,
  }));

  const difficultyRows: BreakdownRow[] = difficulty.map((d) => ({
    label: DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty,
    value: d.accuracy,
    max: 100,
    display: `${d.accuracy}%`,
    caption: `${d.correct}/${d.attempts} correct`,
  }));

  const originRows: BreakdownRow[] = origins.map((item) => ({
    label: item.key,
    value: item.accuracy,
    max: 100,
    display: `${item.accuracy}%`,
    caption: `${item.correct}/${item.attempts} correct`,
  }));

  const modeRows: BreakdownRow[] = studyModes.map((item) => ({
    label: item.key,
    value: item.accuracy,
    max: 100,
    display: `${item.accuracy}%`,
    caption: `${item.attempts} graded attempts`,
  }));

  return (
    <Page>
      <PageHeader
        eyebrow="Statistics"
        title="Your progress"
        description="Accuracy, coverage, timing and streaks — for everything, a subject, or any set of chapters."
      />

      {!hasAnyActivity ? (
        <EmptyState
          icon="chart"
          title="No data yet"
          description="Take a quiz or revise a few questions and your analytics will build up here."
        />
      ) : (
        <>
          <div className={styles.timeFilter} aria-label="Analytics time range">
            <span className={styles.timeLabel}>Time range</span>
            <div className={styles.timeOptions}>
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

          {!scopeHasData ? (
            <EmptyState
              icon="chart"
              title="No activity in this selection"
              description="Try a different chapter or subject, or clear the filter."
            />
          ) : (
            <>
              <div className={styles.tiles}>
                <StatTile
                  icon="target"
                  label="Accuracy"
                  value={`${overview.accuracy}%`}
                  sublabel={`${overview.correct}/${overview.answered} correct`}
                />
                <StatTile icon="check" label="Answered" value={String(overview.answered)} />
                <StatTile icon="sparkle" label="Quizzes" value={String(overview.quizzes)} />
                <StatTile
                  icon="clock"
                  label="Avg / question"
                  value={
                    overview.avgTimePerQuestionMs
                      ? humanizeDuration(overview.avgTimePerQuestionMs)
                      : '—'
                  }
                />
                <StatTile
                  icon="clock"
                  label="Time studied"
                  value={humanizeDuration(overview.timeStudiedMs)}
                />
                <StatTile
                  icon="flame"
                  label="Current streak"
                  value={`${overview.currentStreak}d`}
                  sublabel={`longest ${overview.longestStreak}d`}
                />
                <StatTile icon="chart" label="Active days" value={String(overview.activeDays)} />
                <StatTile
                  icon="book"
                  label="Chapters revised"
                  value={String(overview.chaptersRevised)}
                />
              </div>

              <div className={styles.chartGrid}>
                <section className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>Daily activity</h2>
                    <span className={styles.cardHint}>Questions · last 14 days</span>
                  </div>
                  <BarChart
                    data={activity.map((d) => ({
                      label: d.label,
                      value: d.questions,
                      tooltip: `${d.label}: ${d.questions} questions · ${humanizeDuration(d.timeMs)}`,
                    }))}
                  />
                </section>

                {trend.length > 0 && (
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

              <div className={styles.breakdownGrid}>
                {subjectRows.length > 0 && (
                  <section className={styles.card}>
                    <div className={styles.cardHead}>
                      <h2 className={styles.cardTitle}>Accuracy by subject</h2>
                    </div>
                    <StatBreakdown rows={subjectRows} />
                  </section>
                )}
                {difficultyRows.length > 0 && (
                  <section className={styles.card}>
                    <div className={styles.cardHead}>
                      <h2 className={styles.cardTitle}>Accuracy by difficulty</h2>
                    </div>
                    <StatBreakdown rows={difficultyRows} />
                  </section>
                )}
                {originRows.length > 0 && (
                  <section className={styles.card}>
                    <div className={styles.cardHead}>
                      <h2 className={styles.cardTitle}>Accuracy by question source</h2>
                    </div>
                    <StatBreakdown rows={originRows} />
                  </section>
                )}
                {modeRows.length > 0 && (
                  <section className={styles.card}>
                    <div className={styles.cardHead}>
                      <h2 className={styles.cardTitle}>Learning vs quiz</h2>
                    </div>
                    <StatBreakdown rows={modeRows} />
                  </section>
                )}
              </div>

              {chapterStats.length > 0 && (
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
