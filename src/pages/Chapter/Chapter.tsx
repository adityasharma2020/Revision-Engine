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
import type { Chapter as ChapterModel, MainsQuestion, PrelimsQuestion } from '../../types';
import { questionOriginKind, type QuestionOriginKind } from '../../utils/questionOrigin';
import styles from './Chapter.module.css';

type Mode = 'learning' | 'quiz';
type TabId = 'prelims' | 'mains';
type OriginFilter = 'all' | QuestionOriginKind;

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
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const filteredPrelims = filterByOrigin(chapter.prelims, origin);
  const filteredMains = filterByOrigin(chapter.mains, origin);
  const availableOrigins = new Set(
    [...chapter.prelims, ...chapter.mains]
      .filter((question) => question.origin)
      .map((question) => questionOriginKind(question.origin)),
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

      {availableOrigins.size > 0 && (
        <div className={styles.originFilter} aria-label="Filter questions by origin">
          <span className={styles.filterLabel}>Question source</span>
          <div className={styles.filterOptions}>
            {(['all', 'fyq', 'pyq', 'other'] as const).map((value) =>
              value === 'all' || availableOrigins.has(value) ? (
                <button
                  key={value}
                  type="button"
                  className={origin === value ? styles.filterActive : styles.filterButton}
                  aria-pressed={origin === value}
                  onClick={() => setOrigin(value)}
                >
                  {value === 'all' ? 'All' : value.toUpperCase()}
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}

      {mode === 'quiz' ? (
        <QuizRunner key={origin} chapter={chapter} questions={filteredPrelims} />
      ) : (
        <LearningView
          chapter={chapter}
          prelims={filteredPrelims}
          mains={filteredMains}
          tab={tab}
          onTab={setTab}
        />
      )}
    </>
  );
}

function LearningView({
  chapter,
  prelims,
  mains,
  tab,
  onTab,
}: {
  chapter: ChapterModel;
  prelims: readonly PrelimsQuestion[];
  mains: readonly MainsQuestion[];
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
            { id: 'prelims', label: 'Prelims', count: prelims.length },
            { id: 'mains', label: 'Mains', count: mains.length },
          ]}
        />
      </div>

      {tab === 'prelims' ? (
        <QuestionList empty="No prelims questions in this chapter.">
          {prelims.map((q, i) => (
            <PrelimsCard key={q.id} question={q} index={i + 1} chapterId={chapter.id} />
          ))}
        </QuestionList>
      ) : (
        <QuestionList empty="No mains questions in this chapter.">
          {mains.map((q, i) => (
            <MainsCard key={q.id} question={q} index={i + 1} chapterId={chapter.id} />
          ))}
        </QuestionList>
      )}
    </>
  );
}

function filterByOrigin<T extends { readonly origin?: string }>(
  questions: readonly T[],
  filter: OriginFilter,
): readonly T[] {
  return filter === 'all'
    ? questions
    : questions.filter((question) => questionOriginKind(question.origin) === filter);
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
