import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AsyncBoundary, Icon } from '../../components/common';
import { ChapterCard } from '../../components/dashboard/ChapterCard';
import { Page } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { useUserData } from '../../context/UserDataContext';
import { useLibrary } from '../../hooks/useChapters';
import type { ChapterSummary } from '../../types';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const state = useLibrary();
  return (
    <Page>
      <AsyncBoundary state={state} loadingLabel="Preparing your dashboard…">
        {(chapters) => <HomeContent chapters={chapters} />}
      </AsyncBoundary>
    </Page>
  );
}

function HomeContent({ chapters }: { chapters: readonly ChapterSummary[] }) {
  const { progress, quizResults } = useUserData();
  const recent = useMemo(() => {
    const activity = new Map<string, number>();
    Object.values(progress).forEach((item) => activity.set(item.chapterId, item.lastVisitedAt));
    quizResults.forEach((result) => {
      activity.set(result.chapterId, Math.max(activity.get(result.chapterId) ?? 0, result.takenAt));
    });
    return chapters
      .filter((chapter) => activity.has(chapter.id))
      .sort((a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0))
      .slice(0, 3);
  }, [chapters, progress, quizResults]);
  const continueChapter = recent[0] ?? chapters[0];
  const totalQuestions = chapters.reduce(
    (sum, chapter) => sum + chapter.prelimsCount + chapter.mainsCount,
    0,
  );

  return (
    <>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Revision dashboard</span>
          <h1>What will you revise today?</h1>
          <p>Continue where you stopped, test yourself, or add new study material.</p>
        </div>
        <div className={styles.summary}>
          <strong>{chapters.length}</strong><span>chapters</span>
          <strong>{totalQuestions}</strong><span>questions</span>
          <strong>{quizResults.length}</strong><span>quizzes</span>
        </div>
      </section>

      {continueChapter && (
        <Link to={Routes.chapter(continueChapter.id)} className={styles.continueCard}>
          <span className={styles.continueIcon}><Icon name="target" size={22} /></span>
          <div>
            <small>{recent.length > 0 ? 'Continue studying' : 'Start your revision'}</small>
            <strong>{continueChapter.title}</strong>
            <span>{continueChapter.subject} · Chapter {continueChapter.chapterNumber}</span>
          </div>
          <Icon name="chevronRight" size={20} />
        </Link>
      )}

      <section className={styles.actions} aria-label="Quick actions">
        <Action to={Routes.library} icon="book" title="Open library" text="Browse every subject and chapter." />
        <Action to={Routes.import} icon="plus" title="Import your own" text="Create a chapter from your material." />
        <Action to={continueChapter ? Routes.chapter(continueChapter.id) : Routes.library} icon="clock" title="Take a quiz" text="Start a timed attempt with saved results." />
        <Action to={Routes.search} icon="search" title="Find a question" text="Search chapters, tags and question text." />
      </section>

      {recent.length > 0 && (
        <section className={styles.recent}>
          <div className={styles.sectionHead}>
            <div><span>Pick up quickly</span><h2>Recently studied</h2></div>
            <Link to={Routes.library}>View library <Icon name="chevronRight" size={15} /></Link>
          </div>
          <div className={styles.recentGrid}>
            {recent.map((chapter) => <ChapterCard key={chapter.id} chapter={chapter} />)}
          </div>
        </section>
      )}
    </>
  );
}

function Action({ to, icon, title, text }: {
  to: string;
  icon: 'book' | 'plus' | 'clock' | 'search';
  title: string;
  text: string;
}) {
  return (
    <Link to={to} className={styles.action}>
      <span><Icon name={icon} size={19} /></span>
      <div><strong>{title}</strong><small>{text}</small></div>
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}
