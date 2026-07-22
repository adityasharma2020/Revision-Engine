import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Badge, Button, EmptyState, Icon, Tabs } from '../../components/common';
import { Page } from '../../components/layout';
import { MainsCard } from '../../components/quiz/MainsCard';
import { PrelimsCard } from '../../components/quiz/PrelimsCard';
import { QuizRunner } from '../../components/quiz/QuizRunner';
import { Routes } from '../../constants/routes';
import { subjectStyle } from '../../constants/subjects';
import { useChapter } from '../../hooks/useChapters';
import type { Chapter as ChapterModel, MainsQuestion, PrelimsQuestion } from '../../types';
import { questionOriginKind, type QuestionOriginKind } from '../../utils/questionOrigin';
import { hasQuizDraft } from '../../hooks/useQuizSession';
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
  const [searchParams] = useSearchParams();
  const { hue, label } = subjectStyle(chapter.subject);
  const [mode, setMode] = useState<Mode>('learning');
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<TabId>(requestedTab === 'mains' || requestedTab === 'prelims'
    ? requestedTab
    : chapter.prelims.length > 0 ? 'prelims' : 'mains');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [quizActive, setQuizActive] = useState(false);
  const [leaveQuizOpen, setLeaveQuizOpen] = useState(false);
  const filteredPrelims = filterByOrigin(chapter.prelims, origin);
  const filteredMains = filterByOrigin(chapter.mains, origin);
  const availableOrigins = new Set(
    [...chapter.prelims, ...chapter.mains]
      .filter((question) => question.origin)
      .map((question) => questionOriginKind(question.origin)),
  );
  const quizDraftPresent = hasQuizDraft(chapter.id);

  const changeMode = (next: Mode) => {
    if (next === 'learning' && mode === 'quiz' && quizActive) {
      setLeaveQuizOpen(true);
      return;
    }
    setMode(next);
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headTop}>
          <Badge hue={hue}>{label}</Badge>
          <span className={styles.chapterNo}>Chapter {chapter.chapterNumber}</span>
          <Link to={`${Routes.search}?chapter=${encodeURIComponent(chapter.id)}`} className={styles.chapterSearch}>
            <Icon name="search" size={15} /> Search chapter
          </Link>
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
          onChange={changeMode}
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
                  disabled={quizActive || quizDraftPresent}
                  title={quizActive ? 'Finish or leave the active quiz before changing its source.' : undefined}
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
        <QuizRunner key={origin} chapter={chapter} questions={filteredPrelims} onActiveChange={setQuizActive} />
      ) : (
        <LearningView
          chapter={chapter}
          prelims={filteredPrelims}
          mains={filteredMains}
          tab={tab}
          onTab={setTab}
        />
      )}

      {leaveQuizOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setLeaveQuizOpen(false)}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-quiz-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className={styles.modalIcon}><Icon name="clock" size={20} /></span>
            <h2 id="leave-quiz-title">Quiz in progress</h2>
            <p>Submit your timed quiz before switching to Learning mode. This keeps the attempt and timer accurate.</p>
            <div className={styles.modalActions}>
              <Button variant="primary" onClick={() => setLeaveQuizOpen(false)}>Continue quiz</Button>
            </div>
          </section>
        </div>
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
  useEffect(() => {
    if (!window.location.hash.startsWith('#question-')) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, prelims, mains]);

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
            <PrelimsCard key={q.id} elementId={`question-${q.id}`} question={q} index={i + 1} chapterId={chapter.id} />
          ))}
        </QuestionList>
      ) : (
        <QuestionList empty="No mains questions in this chapter.">
          {mains.map((q, i) => (
            <MainsCard key={q.id} elementId={`question-${q.id}`} question={q} index={i + 1} chapterId={chapter.id} />
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
