import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
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
      <AsyncBoundary state={state} loadingLabel="Loading chapter…">
        {(chapter) => <ChapterView key={chapter.id} chapter={chapter} />}
      </AsyncBoundary>
    </Page>
  );
}

function ChapterView({ chapter }: { chapter: ChapterModel }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { hue, label } = subjectStyle(chapter.subject);
  const requestedTab = searchParams.get('tab');
  const requestedMode = searchParams.get('mode');
  const hasQuestionTarget = location.hash.startsWith('#question-');
  const focusLabel = searchParams.get('focus') === 'bookmark'
    ? 'Bookmarked question'
    : 'Search match';
  const [mode, setMode] = useState<Mode>(() => {
    if (requestedTab || hasQuestionTarget) return 'learning';
    if (requestedMode === 'quiz') return 'quiz';
    if (hasQuizDraft(chapter.id)) return 'quiz';
    return 'quiz';
  });
  const [tab, setTab] = useState<TabId>(requestedTab === 'mains' || requestedTab === 'prelims'
    ? requestedTab
    : chapter.prelims.length > 0 ? 'prelims' : 'mains');
  const [origins, setOrigins] = useState<Record<Mode, OriginFilter>>({
    quiz: 'all',
    learning: 'all',
  });
  const origin = origins[mode];
  const [quizActive, setQuizActive] = useState(false);
  const [quizImmersive, setQuizImmersive] = useState(false);
  const [leaveQuizOpen, setLeaveQuizOpen] = useState(false);
  const filteredPrelims = filterByOrigin(chapter.prelims, origin);
  const filteredMains = filterByOrigin(chapter.mains, origin);
  const quizAvailableOrigins = new Set(
    chapter.prelims
      .filter((question) => question.origin)
      .map((question) => questionOriginKind(question.origin)),
  );
  const availableOrigins = new Set(
    [...chapter.prelims, ...chapter.mains]
      .filter((question) => question.origin)
      .map((question) => questionOriginKind(question.origin)),
  );
  const quizDraftPresent = hasQuizDraft(chapter.id);
  const hideStudyChrome = mode === 'quiz' && (quizDraftPresent || quizImmersive);

  useEffect(() => {
    if (!hasQuestionTarget) return;
    setMode('learning');
    if (requestedTab === 'prelims' || requestedTab === 'mains') setTab(requestedTab);
    setOrigins((current) => current.learning === 'all'
      ? current
      : { ...current, learning: 'all' });
  }, [hasQuestionTarget, location.hash, requestedTab]);

  useEffect(() => {
    if (requestedMode === 'quiz' && hasQuizDraft(chapter.id)) setMode('quiz');
  }, [chapter.id, requestedMode]);

  const changeMode = (next: Mode) => {
    if (next === 'learning' && mode === 'quiz' && (quizActive || hasQuizDraft(chapter.id))) {
      setLeaveQuizOpen(true);
      return;
    }
    setMode(next);
  };

  return (
    <>
      {!hideStudyChrome && (
        <Link to={Routes.library} className={styles.back}>
          <Icon name="arrowLeft" size={16} />
          Library
        </Link>
      )}
      {!hideStudyChrome && <header className={styles.header}>
        <div className={styles.headTop}>
          <Badge hue={hue}>{label}</Badge>
          <span className={styles.chapterNo}>Chapter {chapter.chapterNumber}</span>
          {!hideStudyChrome && (
            <Link
              to={Routes.search}
              className={styles.chapterSearch}
              aria-keyshortcuts="Meta+Shift+P Control+Shift+P"
              title="Open global search (⌘⇧P or Ctrl⇧P)"
            >
              <Icon name="search" size={15} />
              <span>Global search</span>
              <kbd className={styles.searchShortcut}>⌘⇧P</kbd>
            </Link>
          )}
        </div>
        <h1 className={styles.title}>{chapter.title}</h1>
        {chapter.description && (
          <p className={styles.description}>{chapter.description}</p>
        )}
        {chapter.source && <p className={styles.source}>Source · {chapter.source}</p>}
      </header>}

      {!hideStudyChrome && <div className={styles.modeRow}>
        <button
          type="button"
          className={mode === 'quiz' ? styles.modeActive : styles.modeOption}
          aria-pressed={mode === 'quiz'}
          onClick={() => changeMode('quiz')}
        >
          <span className={styles.modeIcon}><Icon name="clock" size={18} /></span>
          <span><strong>Take a quiz</strong><small>Timed attempt with results saved to history.</small></span>
          {quizDraftPresent && <em>{quizActive ? 'In progress' : 'Paused · resume'}</em>}
        </button>
        <button
          type="button"
          className={mode === 'learning' ? styles.modeActive : styles.modeOption}
          aria-pressed={mode === 'learning'}
          onClick={() => changeMode('learning')}
        >
          <span className={styles.modeIcon}><Icon name="book" size={18} /></span>
          <span><strong>Learn &amp; review</strong><small>Study with instant answers and explanations.</small></span>
        </button>
      </div>}

      {mode === 'quiz' ? (
        <QuizRunner
          chapter={chapter}
          questions={filteredPrelims}
          origin={origins.quiz}
          availableOrigins={quizAvailableOrigins}
          onOrigin={(value) => setOrigins((current) => ({ ...current, quiz: value }))}
          onActiveChange={setQuizActive}
          onImmersiveChange={setQuizImmersive}
        />
      ) : (
        <LearningView
          chapter={chapter}
          prelims={filteredPrelims}
          mains={filteredMains}
          tab={tab}
          onTab={setTab}
          origin={origins.learning}
          availableOrigins={availableOrigins}
          onOrigin={(value) => setOrigins((current) => ({ ...current, learning: value }))}
          targetHash={location.hash}
          focusLabel={focusLabel}
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
            <p>{quizActive
              ? 'Pause or submit your timed quiz before switching modes. This keeps the attempt and timer accurate.'
              : 'This quiz is paused and safely saved. Resume it here, then submit the attempt when you are finished.'}</p>
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
  origin,
  availableOrigins,
  onOrigin,
  targetHash,
  focusLabel,
}: {
  chapter: ChapterModel;
  prelims: readonly PrelimsQuestion[];
  mains: readonly MainsQuestion[];
  tab: TabId;
  onTab: (t: TabId) => void;
  origin: OriginFilter;
  availableOrigins: ReadonlySet<QuestionOriginKind>;
  onOrigin: (origin: OriginFilter) => void;
  targetHash: string;
  focusLabel: string;
}) {
  const targetElementId = targetHash.startsWith('#question-')
    ? decodeURIComponent(targetHash.slice(1))
    : '';

  useEffect(() => {
    if (!targetHash.startsWith('#question-')) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(targetHash.slice(1)))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, prelims, mains, targetHash]);

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

      {availableOrigins.size > 0 && (
        <div className={styles.originFilter} aria-label="Filter learning questions by origin">
          <span className={styles.filterLabel}>Learning source</span>
          <div className={styles.filterOptions}>
            {(['all', 'fyq', 'pyq', 'other'] as const).map((value) =>
              value === 'all' || availableOrigins.has(value) ? (
                <button
                  key={value}
                  type="button"
                  className={origin === value ? styles.filterActive : styles.filterButton}
                  aria-pressed={origin === value}
                  onClick={() => onOrigin(value)}
                >
                  {value === 'all' ? 'All' : value.toUpperCase()}
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}

      {tab === 'prelims' ? (
        <QuestionList empty="No prelims questions in this chapter.">
          {prelims.map((q, i) => (
            <PrelimsCard key={q.id} elementId={`question-${q.id}`} highlighted={targetElementId === `question-${q.id}`} focusLabel={focusLabel} question={q} index={i + 1} chapterId={chapter.id} />
          ))}
        </QuestionList>
      ) : (
        <QuestionList empty="No mains questions in this chapter.">
          {mains.map((q, i) => (
            <MainsCard key={q.id} elementId={`question-${q.id}`} highlighted={targetElementId === `question-${q.id}`} focusLabel={focusLabel} question={q} index={i + 1} chapterId={chapter.id} />
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
