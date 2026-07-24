import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Button, Icon } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { useServices } from '../../context/ServicesContext';
import { useUserData } from '../../context/UserDataContext';
import { STANDARD_QUIZ_SETTINGS, STRICT_QUIZ_SETTINGS } from '../../hooks/useQuizSession';
import { useRevisionPreferences } from '../../hooks/useRevisionPreferences';
import { useLibrary } from '../../hooks/useChapters';
import { RevisionEngine } from '../../services/revision';
import type { ChapterSummary, QuizDefinition, RevisionPreferences, RevisionQueue } from '../../types';
import { DEFAULT_REVISION_PREFERENCES } from '../../types/revision';
import { createId } from '../../utils/id';
import { saveQuizDefinition } from '../../services/quiz';
import { localDateKey, useDailyRevisionAssignment } from '../../hooks/useDailyRevisionAssignment';
import { getQuizPerformance } from '../../utils/quizPerformance';
import { RevisionEngineSettings, type RevisionEngineConfiguration } from '../../components/revision/RevisionEngineSettings';
import styles from './DailyRevision.module.css';

export function DailyRevision() {
  const { chapters: chapterService } = useServices();
  const { userChapters, progress, quizResults, annotations, questionAttemptLog } = useUserData();
  const { preferences, ready: preferencesReady, update, toggleChapter } = useRevisionPreferences();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoStarted = useRef(false);
  const [queue, setQueue] = useState<RevisionQueue | null>(null);
  const [showExam, setShowExam] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [quote, setQuote] = useState({ quote: 'Cultivation of mind should be the ultimate aim of human existence.', author: 'B. R. Ambedkar', topics: ['Education', 'Human development'] as string[] });
  const library = useLibrary();
  const { assignment, ready: assignmentReady, save: saveAssignment } = useDailyRevisionAssignment();
  const assignmentPerformance = assignment?.status === 'completed' && assignment.score
    ? getQuizPerformance(assignment.score.correct, assignment.score.total)
    : null;

  const openAssignment = useCallback(() => {
    if (!assignment || assignment.status !== 'active') return;
    const definition = assignment.definition.studyQuote
      ? assignment.definition
      : { ...assignment.definition, studyQuote: quote };
    saveQuizDefinition(definition);
    if (definition !== assignment.definition) saveAssignment({ ...assignment, definition });
    navigate(Routes.quizSession(definition.id));
  }, [assignment, navigate, quote, saveAssignment]);

  const launchQueue = useCallback((revisionQueue: RevisionQueue) => {
    if (revisionQueue.recommendations.length === 0) return;
    if (assignment) {
      if (assignment.status === 'active') openAssignment();
      return;
    }
    const questions = revisionQueue.recommendations.map((item) => item.question);
    const quizId = createId();
    const dateKey = localDateKey();
    const sessionSettings = preferences.sessionMode === 'strict'
      ? { ...STRICT_QUIZ_SETTINGS }
      : { ...STANDARD_QUIZ_SETTINGS };
    const definition: QuizDefinition = {
      id: quizId,
      chapter: {
        id: 'daily-revision',
        subject: 'Mixed revision',
        title: preferences.examName ? `${preferences.examName} · Daily Revision` : 'Daily Revision',
        chapterNumber: 0,
        prelims: questions,
        mains: [],
      },
      questions,
      settings: sessionSettings,
      questionSet: {
        type: 'custom',
        label: 'Smart daily queue',
        questionIds: questions.map((question) => question.id),
        sourceQuestionCount: revisionQueue.availableCount,
      },
      questionChapterIds: Object.fromEntries(
        revisionQueue.recommendations.map((item) => [item.question.id, item.chapter.id]),
      ),
      questionRevisionMeta: Object.fromEntries(
        revisionQueue.recommendations.map((item) => [item.question.id, {
          attempts: item.attempts,
          accuracy: item.accuracy,
          level: item.level,
          reason: item.reason,
        }]),
      ),
      createdAt: Date.now(),
      purpose: 'daily-revision' as const,
      dailyDateKey: dateKey,
      studyQuote: quote,
    };
    saveQuizDefinition(definition);
    saveAssignment({
      dateKey,
      status: 'active',
      definition,
      generatedAt: Date.now(),
      attemptNumber: 1,
    });
    navigate(Routes.quizSession(quizId));
  }, [assignment, navigate, openAssignment, preferences.examName, preferences.sessionMode, quote, saveAssignment]);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    fetch(`${base}quotes/upsc.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Quote request failed');
        return response.json() as Promise<{ quotes?: Array<{ id: string; quote: string; author: string; topics: string[] }> }>;
      })
      .then((value) => {
        const quotes = value.quotes ?? [];
        if (quotes.length === 0) return;
        const previous = sessionStorage.getItem('revision-engine:last-upsc-quote');
        const choices = quotes.filter((item) => item.id !== previous);
        const selected = (choices.length ? choices : quotes)[Math.floor(Math.random() * (choices.length || quotes.length))];
        sessionStorage.setItem('revision-engine:last-upsc-quote', selected.id);
        setQuote({ quote: selected.quote, author: selected.author, topics: selected.topics });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const examDays = useMemo(() => {
    if (!preferences.examDate) return null;
    return Math.ceil((new Date(`${preferences.examDate}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  }, [preferences.examDate]);
  const dailyResults = useMemo(() => quizResults
    .filter((result) => result.purpose === 'daily-revision' || result.chapterId === 'daily-revision')
    .sort((left, right) => right.takenAt - left.takenAt), [quizResults]);

  const generate = useCallback(async (summaries: readonly ChapterSummary[], startImmediately = false) => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const selected = summaries.filter((chapter) => preferences.includedChapterIds.includes(chapter.id));
      const chapters = await Promise.all(selected.map(async (summary) => {
        const userChapter = userChapters.find((chapter) => chapter.id === summary.id);
        return userChapter ?? chapterService.loadChapter(summary.id);
      }));
    const candidates = chapters.flatMap((chapter) =>
      chapter.prelims.map((question) => ({ chapter, question })));
    const next = new RevisionEngine().generate(candidates, {
      progress, quizResults, annotations, questionAttemptLog,
    }, {
      limit: preferences.dailyQuestionLimit,
      newQuestionPercent: preferences.newQuestionPercent,
      includedChapterIds: preferences.includedChapterIds,
      examDate: preferences.examDate,
      correctIntervals: preferences.correctIntervals,
      wrongReturnDays: preferences.wrongReturnDays,
      skippedReturnDays: preferences.skippedReturnDays,
      wrongLevelDrop: preferences.wrongLevelDrop,
      skippedLevelDrop: preferences.skippedLevelDrop,
      balanceSubjects: preferences.balanceSubjects,
      prioritizeBookmarks: preferences.prioritizeBookmarks,
      fillDailyCapacity: preferences.fillDailyCapacity,
    });
    setQueue(next);
    if (startImmediately) launchQueue(next);
    } catch {
      setGenerateError('Some selected chapters could not be loaded. Try again.');
    } finally {
      setGenerating(false);
    }
  }, [annotations, chapterService, launchQueue, preferences, progress, questionAttemptLog, quizResults, userChapters]);

  useEffect(() => {
    const shouldStart = searchParams.get('autostart') === '1';
    if (autoStarted.current || !shouldStart) return;
    if (!assignmentReady || !preferencesReady || library.status !== 'success') return;
    autoStarted.current = true;
    if (assignment?.status === 'active') {
      openAssignment();
      return;
    }
    if (assignment?.status === 'completed' || preferences.includedChapterIds.length === 0) return;
    void generate(library.data, true);
  }, [assignment, assignmentReady, generate, library, openAssignment, preferences.includedChapterIds.length, preferencesReady, searchParams]);

  const reattemptToday = () => {
    if (!assignment || assignment.status !== 'completed') return;
    const quizId = createId();
    const definition = { ...assignment.definition, id: quizId, createdAt: Date.now(), studyQuote: assignment.definition.studyQuote ?? quote };
    saveQuizDefinition(definition);
    saveAssignment({
      dateKey: assignment.dateKey,
      status: 'active',
      definition,
      generatedAt: assignment.generatedAt,
      attemptNumber: assignment.attemptNumber + 1,
    });
    navigate(Routes.quizSession(quizId));
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Your revision command centre"
        title="Daily Revision"
        description="A powerful scheduled system that remembers what you know—and what you are likely to forget."
        actions={<Button variant="secondary" onClick={() => navigate(Routes.practice)}><Icon name="flame" size={16} />Practice anytime</Button>}
      />
      <AsyncBoundary state={library} loadingLabel="Preparing your revision queue…">
        {(chapters) => (
          <div className={styles.layout}>
            <section className={styles.countdownHero}>
              <div>{preferences.examName && <span>{preferences.examName}</span>}<strong>{examDays !== null && examDays >= 0 ? examDays : '—'}</strong><small>days remaining</small></div>
              <blockquote>“{quote.quote}”<cite>{quote.author} · {quote.topics.join(' · ')}</cite></blockquote>
            </section>
            {!assignmentReady ? (
              <section className={styles.assignmentActive}>
                <span className={styles.assignmentIcon}><Icon name="clock" size={24} /></span>
                <div className={styles.assignmentMain}><small>Daily Revision</small><h2>Restoring today’s assignment…</h2><p>Checking your saved revision before enabling generation.</p></div>
              </section>
            ) : assignment ? (
              <section className={assignment.status === 'completed'
                ? `${styles.assignmentComplete} ${assignmentPerformance ? styles[`performance_${assignmentPerformance.tone}`] : ''}`
                : styles.assignmentActive}>
                <span className={styles.assignmentIcon}>{assignment.status === 'completed' && assignmentPerformance
                  ? <span className={styles.performanceEmoji} aria-hidden="true">{assignmentPerformance.emoji}</span>
                  : <Icon name="target" size={26} />}</span>
                <div className={styles.assignmentMain}>
                  <small>{assignment.status === 'completed' ? '✅ Today’s revision completed' : '⏳ Today’s revision is pending'}</small>
                  <h2>{assignment.status === 'completed' && assignmentPerformance ? assignmentPerformance.label : assignment.status === 'completed' ? 'Today’s work is done.' : 'Continue your assigned revision'}</h2>
                  <p>
                    {assignment.status === 'completed' && assignment.score
                      ? `You answered ${assignment.score.correct} correctly out of ${assignment.score.total} questions (${assignmentPerformance?.accuracy ?? 0}%). ${assignment.score.skipped} skipped · attempt ${assignment.attemptNumber}.`
                      : `Your ${assignment.definition.questions.length}-question Daily Revision is saved. Resume exactly where you left off.`}
                  </p>
                </div>
                <div className={styles.assignmentActions}>
                  {assignment.status === 'active' ? (
                    <Button variant="primary" onClick={openAssignment}>Continue today’s quiz</Button>
                  ) : (
                    <>
                      {assignment.resultId && <Button variant="primary" onClick={() => navigate(Routes.quizResult(assignment.resultId!))}>Review answers</Button>}
                      <Button variant="secondary" onClick={reattemptToday}>Reattempt same questions</Button>
                    </>
                  )}
                </div>
                <p className={styles.assignmentRule}>{assignment.status === 'completed' ? 'A new Daily Revision will become available tomorrow.' : 'This saved quiz stays available until you complete it.'}</p>
              </section>
            ) : <section className={styles.setup}>
              <div className={styles.setupHead}>
                <span className={styles.mark}><Icon name="target" size={22} /></span>
                <div><h2>Today’s scheduled revision</h2><p>Only due questions from your selected chapters will appear.</p></div>
              </div>
              <div className={styles.estimate}>
                <strong>Daily target: {preferences.dailyQuestionLimit} questions</strong>
                <span>{preferences.includedChapterIds.length} chapters included · {preferences.fillDailyCapacity ? 'due questions first, then unseen questions fill remaining slots' : `up to ${preferences.newQuestionPercent}% unseen questions`}</span>
              </div>
              <div className={styles.setupActions}>
                <Button size="lg" variant="primary" onClick={() => void generate(chapters)} disabled={preferences.includedChapterIds.length === 0 || generating}>{generating ? 'Building queue…' : 'Build today’s queue'}</Button>
                <Button size="lg" variant="secondary" onClick={() => setShowChapters((open) => !open)}>{showChapters ? 'Hide chapters' : 'Choose studied chapters'}</Button>
              </div>
              {preferences.includedChapterIds.length === 0 && <p className={styles.setupHint}>Choose at least one chapter you have studied before generating revision.</p>}
              {generateError && <p className={styles.setupHint} role="alert">{generateError}</p>}
              <DailyEngineSettings preferences={preferences} update={update} />
            </section>}

            {assignment && <section className={styles.setup}>
              <div className={styles.setupHead}>
                <span className={styles.mark}><Icon name="settings" size={22} /></span>
                <div><h2>Daily engine settings</h2><p>Today’s saved quiz will not change. Updates here apply to the next Daily Revision.</p></div>
              </div>
              <div className={styles.estimate}>
                <strong>Next daily target: {preferences.dailyQuestionLimit} questions</strong>
                <span>{preferences.includedChapterIds.length} chapters · independent from Practice Quiz settings</span>
              </div>
              <div className={styles.setupActions}>
                <Button size="lg" variant="secondary" onClick={() => setShowChapters((open) => !open)}>{showChapters ? 'Hide daily chapters' : 'Choose daily chapters'}</Button>
                <Button size="lg" variant="secondary" onClick={() => navigate(Routes.practice)}><Icon name="flame" size={16} />Open separate Practice engine</Button>
              </div>
              <DailyEngineSettings preferences={preferences} update={update} />
            </section>}

            {showChapters && (
              <section className={styles.chapterPicker}>
                <div className={styles.chapterPickerHead}><div><h2>Studied chapters</h2><p>Only selected chapters can contribute questions to daily revision.</p></div><span>{preferences.includedChapterIds.length} selected</span></div>
                <div className={styles.chapterTools}>
                  <label><Icon name="search" size={16} /><input value={chapterSearch} onChange={(event) => setChapterSearch(event.target.value)} placeholder="Search 100+ chapters…" /></label>
                  <button type="button" className={selectedOnly ? styles.toolActive : styles.toolButton} onClick={() => setSelectedOnly((value) => !value)}>Selected only</button>
                </div>
                <div className={styles.chapterList}>
                  {chapters.filter((chapter) => {
                    if (selectedOnly && !preferences.includedChapterIds.includes(chapter.id)) return false;
                    const query = chapterSearch.trim().toLowerCase();
                    return !query || `${chapter.title} ${chapter.subject}`.toLowerCase().includes(query);
                  }).map((chapter) => {
                    const checked = preferences.includedChapterIds.includes(chapter.id);
                    return <button key={chapter.id} type="button" className={checked ? styles.chapterActive : styles.chapterOption} onClick={() => toggleChapter(chapter.id)} aria-pressed={checked}>
                      <span><strong>{chapter.title}</strong><small>{chapter.subject} · {chapter.prelimsCount} prelims questions</small></span>
                      <span className={styles.check}>{checked && <Icon name="check" size={15} />}</span>
                    </button>;
                  })}
                </div>
              </section>
            )}

            <section className={styles.exam}>
              <button type="button" className={styles.examToggle} onClick={() => setShowExam((open) => !open)} aria-expanded={showExam}>
                <span><Icon name="clock" size={18} /><span><strong>{preferences.examName || 'Exam countdown'}</strong><small>{examDays === null ? 'Add a date to enable countdown and urgency ranking' : examDays >= 0 ? `${examDays} days remaining` : 'Exam date has passed'}</small></span></span>
                <Icon name="chevronRight" size={17} />
              </button>
              {showExam && (
                <div className={styles.examFields}>
                  <label><span>Exam name</span><input value={preferences.examName} placeholder="e.g. UPSC Prelims" onChange={(event) => update({ ...preferences, examName: event.target.value })} /></label>
                  <label><span>Exam date</span><input type="date" value={preferences.examDate ?? ''} onChange={(event) => update({ ...preferences, examDate: event.target.value || null })} /></label>
                </div>
              )}
            </section>

            {dailyResults.length > 0 && (
              <details className={styles.dailyHistory}>
                <summary><span><Icon name="clock" size={16} />Past daily revisions ({dailyResults.length})</span><Icon name="chevronRight" size={16} /></summary>
                <div className={styles.dailyHistoryBody}>
                  <div className={styles.dailyHistoryHead}>
                    <div><h2>Daily Revision history</h2><p>Review any completed daily assignment, including previous dates.</p></div>
                    <Button variant="ghost" size="sm" onClick={() => navigate(Routes.statistics)}>Open analytics</Button>
                  </div>
                  <ol>
                    {dailyResults.slice(0, 10).map((result) => {
                      const date = result.dailyDateKey ? new Date(`${result.dailyDateKey}T12:00:00`) : new Date(result.takenAt);
                      const accuracy = result.answered ? Math.round((result.correct / result.answered) * 100) : 0;
                      return <li key={result.id}>
                        <span className={styles.historySuccess}>✓</span>
                        <div><strong>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date)}</strong><small>{result.correct}/{result.totalQuestions} correct · {accuracy}% accuracy · {result.skipped} skipped</small></div>
                        <Button variant="secondary" size="sm" onClick={() => navigate(Routes.quizResult(result.id))}>Review</Button>
                      </li>;
                    })}
                  </ol>
                  {dailyResults.length > 10 && <p className={styles.historyMore}>Showing the latest 10 of {dailyResults.length} attempts. All attempts remain saved in analytics.</p>}
                </div>
              </details>
            )}

            {!assignment && queue && (
              <section className={styles.preview} aria-live="polite">
                <div className={styles.previewHead}>
                  <div><span>Ready for today</span><h2>{queue.recommendations.length} recommended questions</h2><p>{queue.dueCount} due · {queue.newCount} new · approximately {queue.estimatedMinutes} minutes</p></div>
                  <Button variant="primary" onClick={() => launchQueue(queue)} disabled={queue.recommendations.length === 0}>Start revision</Button>
                </div>
                {queue.recommendations.length === 0 && <div className={styles.allDone}><Icon name="check" size={20} /><span><strong>Everything scheduled is complete</strong><small>No questions are due yet. Come back on the next review date.</small></span></div>}
                {queue.totalDueCount > queue.dueCount && <p className={styles.backlog}>{queue.totalDueCount - queue.dueCount} additional due questions remain for the next session.</p>}
              </section>
            )}
          </div>
        )}
      </AsyncBoundary>
    </Page>
  );
}

function DailyEngineSettings({ preferences, update }: { preferences: RevisionPreferences; update: (next: RevisionPreferences) => void }) {
  const value: RevisionEngineConfiguration = {
    questionLimit: preferences.dailyQuestionLimit,
    newQuestionPercent: preferences.newQuestionPercent,
    correctIntervals: preferences.correctIntervals,
    wrongReturnDays: preferences.wrongReturnDays,
    skippedReturnDays: preferences.skippedReturnDays,
    wrongLevelDrop: preferences.wrongLevelDrop,
    skippedLevelDrop: preferences.skippedLevelDrop,
    balanceSubjects: preferences.balanceSubjects,
    prioritizeBookmarks: preferences.prioritizeBookmarks,
    sessionMode: preferences.sessionMode,
    fillCapacity: preferences.fillDailyCapacity,
  };
  return <RevisionEngineSettings
    scope="Daily"
    value={value}
    onChange={(next) => update({
      ...preferences,
      dailyQuestionLimit: next.questionLimit,
      newQuestionPercent: next.newQuestionPercent,
      correctIntervals: next.correctIntervals,
      wrongReturnDays: next.wrongReturnDays,
      skippedReturnDays: next.skippedReturnDays,
      wrongLevelDrop: next.wrongLevelDrop,
      skippedLevelDrop: next.skippedLevelDrop,
      balanceSubjects: next.balanceSubjects,
      prioritizeBookmarks: next.prioritizeBookmarks,
      sessionMode: next.sessionMode,
      fillDailyCapacity: next.fillCapacity,
    })}
    onReset={() => update({ ...DEFAULT_REVISION_PREFERENCES, includedChapterIds: preferences.includedChapterIds })}
  />;
}
