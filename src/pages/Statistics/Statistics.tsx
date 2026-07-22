import { useMemo } from 'react';
import { EmptyState } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { AccuracyChart } from '../../components/statistics/AccuracyChart';
import { StatTile } from '../../components/statistics/StatTile';
import { useUserData } from '../../context/UserDataContext';
import { accuracyTrend, computeOverall } from '../../utils/statistics';
import { humanizeDuration } from '../../utils/time';
import styles from './Statistics.module.css';

export function Statistics() {
  const { quizResults, annotations, progress } = useUserData();

  const overall = useMemo(
    () => computeOverall(quizResults, annotations, progress),
    [quizResults, annotations, progress],
  );
  const trend = useMemo(() => accuracyTrend(quizResults), [quizResults]);

  const hasActivity = overall.totalQuizzes > 0 || overall.questionsAnswered > 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Statistics"
        title="Your progress"
        description="Accuracy, coverage and time invested across your revision."
      />

      {!hasActivity ? (
        <EmptyState
          icon="chart"
          title="No data yet"
          description="Take a quiz or revise a few questions and your statistics will build up here."
        />
      ) : (
        <>
          <div className={styles.tiles}>
            <StatTile
              icon="target"
              label="Overall accuracy"
              value={`${overall.accuracy}%`}
              sublabel={`${overall.correct}/${overall.questionsAnswered} correct`}
            />
            <StatTile
              icon="check"
              label="Questions answered"
              value={String(overall.questionsAnswered)}
            />
            <StatTile
              icon="sparkle"
              label="Quizzes taken"
              value={String(overall.totalQuizzes)}
            />
            <StatTile
              icon="clock"
              label="Time studied"
              value={humanizeDuration(overall.timeStudiedMs)}
            />
            <StatTile
              icon="book"
              label="Chapters revised"
              value={String(overall.chaptersRevised)}
            />
            <StatTile
              icon="bookmark"
              label="Bookmarks"
              value={String(overall.bookmarks)}
            />
          </div>

          {trend.length > 0 && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Accuracy over time</h2>
                <span className={styles.cardHint}>Last {trend.length} quizzes</span>
              </div>
              <AccuracyChart data={trend} />
            </section>
          )}
        </>
      )}
    </Page>
  );
}
