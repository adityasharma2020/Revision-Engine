import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AsyncBoundary, Badge, EmptyState, Icon, Tabs } from '../../components/common';
import { Page } from '../../components/layout';
import { MainsCard } from '../../components/quiz/MainsCard';
import { PrelimsCard } from '../../components/quiz/PrelimsCard';
import { QuizRunner } from '../../components/quiz/QuizRunner';
import { Routes } from '../../constants/routes';
import { subjectStyle } from '../../constants/subjects';
import { useChapter } from '../../hooks/useChapters';
import type { Chapter as ChapterModel } from '../../types';
import styles from './Chapter.module.css';

type Mode = 'learning' | 'quiz';
type TabId = 'prelims' | 'mains';

export function Chapter() {
  const { chapterId = '' } = useParams();
  const state = useChapter(chapterId);

  return (
    <Page narrow>
      <Link to={Routes.dashboard} className={styles.back}>
        <Icon name="arrowLeft" size={16} />
        Library
      </Link>
      <AsyncBoundary state={state} loadingLabel="Loading chapter…">
        {(chapter) => <ChapterView chapter={chapter} />}
      </AsyncBoundary>
    </Page>
  );
}

function ChapterView({ chapter }: { chapter: ChapterModel }) {
  const { hue, label } = subjectStyle(chapter.subject);
  const [mode, setMode] = useState<Mode>('learning');
  const [tab, setTab] = useState<TabId>(
    chapter.prelims.length > 0 ? 'prelims' : 'mains',
  );

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headTop}>
          <Badge hue={hue}>{label}</Badge>
          <span className={styles.chapterNo}>Chapter {chapter.chapterNumber}</span>
        </div>
        <h1 className={styles.title}>{chapter.title}</h1>
        {chapter.description && (
          <p className={styles.description}>{chapter.description}</p>
        )}
        {chapter.source && <p className={styles.source}>Source · {chapter.source}</p>}
      </header>

      <div className={styles.modeRow}>
        <Tabs<Mode>
          aria-label="Study mode"
          value={mode}
          onChange={setMode}
          items={[
            { id: 'learning', label: 'Learning' },
            { id: 'quiz', label: 'Quiz' },
          ]}
        />
        <p className={styles.modeHint}>
          {mode === 'learning'
            ? 'Answers and explanations reveal instantly.'
            : 'Timed — answers reveal at the end.'}
        </p>
      </div>

      {mode === 'quiz' ? (
        <QuizRunner chapter={chapter} />
      ) : (
        <LearningView chapter={chapter} tab={tab} onTab={setTab} />
      )}
    </>
  );
}

function LearningView({
  chapter,
  tab,
  onTab,
}: {
  chapter: ChapterModel;
  tab: TabId;
  onTab: (t: TabId) => void;
}) {
  return (
    <>
      <div className={styles.tabsRow}>
        <Tabs<TabId>
          aria-label="Question type"
          value={tab}
          onChange={onTab}
          items={[
            { id: 'prelims', label: 'Prelims', count: chapter.prelims.length },
            { id: 'mains', label: 'Mains', count: chapter.mains.length },
          ]}
        />
      </div>

      {tab === 'prelims' ? (
        <QuestionList empty="No prelims questions in this chapter.">
          {chapter.prelims.map((q, i) => (
            <PrelimsCard key={q.id} question={q} index={i + 1} chapterId={chapter.id} />
          ))}
        </QuestionList>
      ) : (
        <QuestionList empty="No mains questions in this chapter.">
          {chapter.mains.map((q, i) => (
            <MainsCard key={q.id} question={q} index={i + 1} chapterId={chapter.id} />
          ))}
        </QuestionList>
      )}
    </>
  );
}

function QuestionList({
  children,
  empty,
}: {
  children: React.ReactNode[];
  empty: string;
}) {
  if (children.length === 0) {
    return <EmptyState icon="book" title="Nothing here yet" description={empty} />;
  }
  return <div className={styles.list}>{children}</div>;
}
