import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AsyncBoundary, Button, Icon } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { useServices } from '../../context/ServicesContext';
import { useUserData } from '../../context/UserDataContext';
import { useLibrary } from '../../hooks/useChapters';
import { STANDARD_QUIZ_SETTINGS, STRICT_QUIZ_SETTINGS } from '../../hooks/useQuizSession';
import { usePracticePreferences } from '../../hooks/usePracticePreferences';
import { useDailyRevisionAssignment } from '../../hooks/useDailyRevisionAssignment';
import { saveQuizDefinition } from '../../services/quiz';
import { RevisionEngine } from '../../services/revision';
import type { ChapterSummary, QuizDefinition, RevisionQueue, RevisionRecommendation } from '../../types';
import { DEFAULT_PRACTICE_PREFERENCES } from '../../types/revision';
import { createId } from '../../utils/id';
import { RevisionEngineSettings, type RevisionEngineConfiguration } from '../../components/revision/RevisionEngineSettings';
import styles from './PracticeQuiz.module.css';

function recommendationKey(item: RevisionRecommendation): string {
  return `${item.chapter.id}\u0000${item.question.id}`;
}

export function PracticeQuiz() {
  const navigate = useNavigate();
  const library = useLibrary();
  const { chapters: chapterService } = useServices();
  const {
    ready: userDataReady,
    userChapters,
    progress,
    quizResults,
    annotations,
    questionAttemptLog,
  } = useUserData();
  const { preferences, ready: preferencesReady, update: updatePreferences } = usePracticePreferences();
  const { assignment: dailyAssignment } = useDailyRevisionAssignment();
  const selectedChapterIds = preferences.includedChapterIds
    ?? (library.status === 'success' ? library.data.map((chapter) => chapter.id) : []);
  const questionCount = preferences.questionLimit;
  const sessionMode = preferences.sessionMode;
  const [chapterSearch, setChapterSearch] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [queue, setQueue] = useState<RevisionQueue | null>(null);
  const [selectedQuestionKeys, setSelectedQuestionKeys] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQueue(null);
    setSelectedQuestionKeys(new Set());
    setQuestionSearch('');
  }, [questionCount, preferences.includedChapterIds, preferences.newQuestionPercent, preferences.correctIntervals, preferences.wrongReturnDays, preferences.skippedReturnDays, preferences.wrongLevelDrop, preferences.skippedLevelDrop, preferences.balanceSubjects, preferences.prioritizeBookmarks, preferences.fillPracticeCapacity, preferences.includeScheduled, preferences.excludeTodaysDailyQuestions, preferences.examDate]);

  const practiceResults = useMemo(() => quizResults
    .filter((result) => result.purpose === 'practice')
    .sort((left, right) => right.takenAt - left.takenAt), [quizResults]);

  const buildPool = async (summaries: readonly ChapterSummary[]) => {
    if (!selectedChapterIds.length) return;
    setBuilding(true);
    setError(null);
    try {
      const selected = summaries.filter((chapter) => selectedChapterIds.includes(chapter.id));
      const chapters = await Promise.all(selected.map(async (summary) => {
        const userChapter = userChapters.find((chapter) => chapter.id === summary.id);
        return userChapter ?? chapterService.loadChapter(summary.id);
      }));
      const dailyQuestionKeys = new Set((dailyAssignment?.definition.questions ?? []).map((question) => {
        const chapterId = dailyAssignment?.definition.questionChapterIds?.[question.id] ?? dailyAssignment?.definition.chapter.id;
        return `${chapterId}\u0000${question.id}`;
      }));
      const candidates = chapters.flatMap((chapter) => chapter.prelims
        .filter((question) => !preferences.excludeTodaysDailyQuestions || !dailyQuestionKeys.has(`${chapter.id}\u0000${question.id}`))
        .map((question) => ({ chapter, question })));
      const context = {
        progress,
        quizResults,
        annotations,
        questionAttemptLog,
      };
      const query = {
        newQuestionPercent: preferences.newQuestionPercent,
        includedChapterIds: selectedChapterIds,
        examDate: preferences.examDate,
        correctIntervals: preferences.correctIntervals,
        wrongReturnDays: preferences.wrongReturnDays,
        skippedReturnDays: preferences.skippedReturnDays,
        wrongLevelDrop: preferences.wrongLevelDrop,
        skippedLevelDrop: preferences.skippedLevelDrop,
        balanceSubjects: preferences.balanceSubjects,
        prioritizeBookmarks: preferences.prioritizeBookmarks,
        fillDailyCapacity: preferences.fillPracticeCapacity,
        includeScheduled: preferences.includeScheduled,
      } as const;
      const engine = new RevisionEngine();
      const recommended = engine.generate(candidates, context, { ...query, limit: questionCount });
      const next = engine.generate(candidates, context, { ...query, limit: 100 });
      setQueue(next);
      setSelectedQuestionKeys(new Set(recommended.recommendations.map(recommendationKey)));
    } catch {
      setError('Some selected chapters could not be loaded. Please try again.');
    } finally {
      setBuilding(false);
    }
  };

  const launch = () => {
    if (!queue) return;
    const selected = queue.recommendations.filter((item) => selectedQuestionKeys.has(recommendationKey(item)));
    if (!selected.length) return;

    const duplicateCounts = selected.reduce<Map<string, number>>((counts, item) => {
      counts.set(item.question.id, (counts.get(item.question.id) ?? 0) + 1);
      return counts;
    }, new Map());
    const sessionItems = selected.map((item) => {
      const duplicate = (duplicateCounts.get(item.question.id) ?? 0) > 1;
      const sessionId = duplicate ? `${item.question.id}@@${item.chapter.id}` : item.question.id;
      return {
        ...item,
        sourceQuestionId: item.question.id,
        question: duplicate ? { ...item.question, id: sessionId } : item.question,
      };
    });
    const questions = sessionItems.map((item) => item.question);
    const subjects = [...new Set(sessionItems.map((item) => item.chapter.subject))];
    const quizId = createId();
    const definition: QuizDefinition = {
      id: quizId,
      chapter: {
        id: 'practice-quiz',
        subject: subjects.length === 1 ? subjects[0] : 'Mixed practice',
        title: subjects.length === 1 ? `${subjects[0]} Practice` : 'Adaptive Practice',
        chapterNumber: 0,
        prelims: questions,
        mains: [],
      },
      questions,
      settings: sessionMode === 'strict' ? { ...STRICT_QUIZ_SETTINGS } : { ...STANDARD_QUIZ_SETTINGS },
      questionSet: {
        type: 'custom',
        label: 'Practice revision queue',
        questionIds: questions.map((question) => question.id),
        sourceQuestionCount: queue.availableCount,
      },
      questionChapterIds: Object.fromEntries(sessionItems.map((item) => [item.question.id, item.chapter.id])),
      questionSourceIds: Object.fromEntries(sessionItems
        .filter((item) => item.question.id !== item.sourceQuestionId)
        .map((item) => [item.question.id, item.sourceQuestionId])),
      questionRevisionMeta: Object.fromEntries(sessionItems.map((item) => [item.question.id, {
        attempts: item.attempts,
        accuracy: item.accuracy,
        level: item.level,
        reason: item.reason,
      }])),
      createdAt: Date.now(),
      purpose: 'practice',
    };
    saveQuizDefinition(definition);
    navigate(Routes.quizSession(quizId));
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Unlimited adaptive practice"
        title="Practice Quiz"
        description="Build another personalised quiz whenever you want. Your one Daily Revision remains separate and unchanged."
      />
      <AsyncBoundary state={library} loadingLabel="Loading your question library…">
        {(chapters) => {
          const subjects = [...new Set(chapters.map((chapter) => chapter.subject))].sort();
          const selectedSet = new Set(selectedChapterIds);
          const filteredChapters = chapters.filter((chapter) => {
            const search = chapterSearch.trim().toLowerCase();
            return !search || `${chapter.title} ${chapter.subject}`.toLowerCase().includes(search);
          });
          const filteredQuestions = queue?.recommendations.filter((item) => {
            const search = questionSearch.trim().toLowerCase();
            return !search || `${item.question.statement} ${item.chapter.title} ${item.chapter.subject}`.toLowerCase().includes(search);
          }) ?? [];
          const selectedQuestionCount = selectedQuestionKeys.size;
          const engineValue: RevisionEngineConfiguration = {
            questionLimit: preferences.questionLimit,
            newQuestionPercent: preferences.newQuestionPercent,
            correctIntervals: preferences.correctIntervals,
            wrongReturnDays: preferences.wrongReturnDays,
            skippedReturnDays: preferences.skippedReturnDays,
            wrongLevelDrop: preferences.wrongLevelDrop,
            skippedLevelDrop: preferences.skippedLevelDrop,
            balanceSubjects: preferences.balanceSubjects,
            prioritizeBookmarks: preferences.prioritizeBookmarks,
            sessionMode: preferences.sessionMode,
            fillCapacity: preferences.fillPracticeCapacity,
          };

          const toggleChapter = (chapterId: string) => {
            updatePreferences({
              ...preferences,
              includedChapterIds: selectedChapterIds.includes(chapterId)
                ? selectedChapterIds.filter((id) => id !== chapterId)
                : [...selectedChapterIds, chapterId],
            });
          };
          const toggleSubject = (subject: string) => {
            const ids = chapters.filter((chapter) => chapter.subject === subject).map((chapter) => chapter.id);
            const allSelected = ids.every((id) => selectedSet.has(id));
            updatePreferences({
              ...preferences,
              includedChapterIds: allSelected
                ? selectedChapterIds.filter((id) => !ids.includes(id))
                : [...new Set([...selectedChapterIds, ...ids])],
            });
          };

          return <div className={styles.layout}>
            <section className={styles.distinction}>
              <div><span><Icon name="target" size={18} /></span><p><strong>Daily Revision</strong><small>One scheduled accountability quiz each day</small></p></div>
              <Icon name="chevronRight" size={18} />
              <div><span><Icon name="flame" size={18} /></span><p><strong>Practice Quiz</strong><small>Unlimited quizzes you configure and start anytime</small></p></div>
            </section>

            <section className={styles.builder}>
              <div className={styles.sectionHead}><span>1</span><div><h2>Practice engine</h2><p>The exact Daily Revision engine, with a separate saved Practice configuration.</p></div><b>Independent</b></div>
              <RevisionEngineSettings
                scope="Practice"
                value={engineValue}
                onChange={(next) => updatePreferences({
                  ...preferences,
                  selectionMode: 'adaptive',
                  questionLimit: next.questionLimit,
                  newQuestionPercent: next.newQuestionPercent,
                  correctIntervals: next.correctIntervals,
                  wrongReturnDays: next.wrongReturnDays,
                  skippedReturnDays: next.skippedReturnDays,
                  wrongLevelDrop: next.wrongLevelDrop,
                  skippedLevelDrop: next.skippedLevelDrop,
                  balanceSubjects: next.balanceSubjects,
                  prioritizeBookmarks: next.prioritizeBookmarks,
                  sessionMode: next.sessionMode,
                  fillPracticeCapacity: next.fillCapacity,
                })}
                onReset={() => updatePreferences({ ...DEFAULT_PRACTICE_PREFERENCES, includedChapterIds: preferences.includedChapterIds })}
              />
              <section className={styles.practiceOnlyOptions}>
                <div><h3>Practice-only options</h3><p>These do not change the shared engine controls above or your Daily Revision settings.</p></div>
                <label className={styles.practiceExamDate}><span>Practice exam date</span><input type="date" value={preferences.examDate ?? ''} onChange={(event) => updatePreferences({ ...preferences, examDate: event.target.value || null })} /><small>Optional urgency adjustment for Practice only.</small></label>
                <div className={styles.practiceOnlyToggles}>
                  <PracticeOnlyToggle label="Allow early review" description="If due and unseen questions are insufficient, include attempted questions before their due date." checked={preferences.includeScheduled} onChange={() => updatePreferences({ ...preferences, includeScheduled: !preferences.includeScheduled })} />
                  <PracticeOnlyToggle label="Use a different set from today’s Daily Revision" description="Keep questions from today’s saved Daily quiz out of new Practice queues." checked={preferences.excludeTodaysDailyQuestions} onChange={() => updatePreferences({ ...preferences, excludeTodaysDailyQuestions: !preferences.excludeTodaysDailyQuestions })} />
                </div>
              </section>

              <div className={styles.divider} />
              <div className={styles.sectionHead}><span>2</span><div><h2>Choose sources</h2><p>Combine any subjects and chapters from your library.</p></div><b>{selectedChapterIds.length} selected</b></div>
              <div className={styles.subjects}>
                {subjects.map((subject) => {
                  const ids = chapters.filter((chapter) => chapter.subject === subject).map((chapter) => chapter.id);
                  const active = ids.length > 0 && ids.every((id) => selectedSet.has(id));
                  return <button key={subject} type="button" className={active ? styles.subjectActive : styles.subject} aria-pressed={active} onClick={() => toggleSubject(subject)}>{subject}<small>{ids.length}</small></button>;
                })}
              </div>
              <div className={styles.chapterTools}>
                <label><Icon name="search" size={16} /><input value={chapterSearch} onChange={(event) => setChapterSearch(event.target.value)} placeholder="Search chapters…" /></label>
                <button type="button" onClick={() => updatePreferences({ ...preferences, includedChapterIds: chapters.map((chapter) => chapter.id) })}>Select all</button>
                <button type="button" onClick={() => updatePreferences({ ...preferences, includedChapterIds: [] })}>Clear</button>
              </div>
              <div className={styles.chapterList}>
                {filteredChapters.map((chapter) => {
                  const active = selectedSet.has(chapter.id);
                  return <button key={chapter.id} type="button" className={active ? styles.chapterActive : styles.chapter} aria-pressed={active} onClick={() => toggleChapter(chapter.id)}>
                    <span><strong>{chapter.title}</strong><small>{chapter.subject} · {chapter.prelimsCount} questions</small></span>
                    <i>{active && <Icon name="check" size={14} />}</i>
                  </button>;
                })}
              </div>

              <div className={styles.buildRow}>
                <div><strong>{selectedChapterIds.length ? `${selectedChapterIds.length} chapters · ${questionCount}-question target` : 'Select at least one chapter'}</strong><small>Build the queue, then review and change the exact questions before starting.</small></div>
                <Button size="lg" variant="primary" disabled={!selectedChapterIds.length || building || !userDataReady || !preferencesReady} onClick={() => void buildPool(chapters)}>{building ? 'Building smart pool…' : queue ? 'Rebuild question pool' : 'Build question pool'}</Button>
              </div>
              {error && <p className={styles.error} role="alert">{error}</p>}
            </section>

            {queue && <section className={styles.preview}>
              <div className={styles.previewHead}>
                <div><span>Question pool ready</span><h2>Review your {selectedQuestionCount}-question quiz</h2><p>{queue.availableCount} eligible across {queue.enrolledChapterCount} chapters. Select up to {questionCount} questions.</p></div>
                <Button size="lg" variant="primary" disabled={selectedQuestionCount === 0 || selectedQuestionCount > questionCount} onClick={launch}>Start practice quiz</Button>
              </div>
              {queue.recommendations.length === 0 ? <div className={styles.emptyPool}><Icon name="check" size={20} /><div><strong>No matching questions</strong><small>Choose more chapters or adjust the Practice engine capacity and unseen allowance.</small></div></div> : <>
                <div className={styles.questionTools}><label><Icon name="search" size={16} /><input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Find a question in this pool…" /></label><span>{selectedQuestionCount}/{questionCount} selected</span></div>
                <div className={styles.questionList}>
                  {filteredQuestions.map((item) => {
                    const key = recommendationKey(item);
                    const active = selectedQuestionKeys.has(key);
                    const atLimit = !active && selectedQuestionCount >= questionCount;
                    return <button key={key} type="button" className={active ? styles.questionActive : styles.question} aria-pressed={active} aria-disabled={atLimit} onClick={() => {
                      if (atLimit) return;
                      setSelectedQuestionKeys((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      });
                    }}>
                      <i>{active && <Icon name="check" size={14} />}</i>
                      <span><strong>{item.question.statement}</strong><small>{item.chapter.title} · {item.reason}</small></span>
                      <em>{item.kind === 'new' ? 'New' : item.kind === 'due' ? 'Due' : 'Review'}</em>
                    </button>;
                  })}
                </div>
              </>}
            </section>}

            {practiceResults.length > 0 && <section className={styles.history}>
              <div className={styles.historyHead}><div><h2>Recent practice</h2><p>Every attempt already contributes to your normal question-level analytics.</p></div><Button variant="ghost" size="sm" onClick={() => navigate(Routes.statistics)}>Open analytics</Button></div>
              <div className={styles.historyList}>{practiceResults.slice(0, 5).map((result) => <button key={result.id} type="button" onClick={() => navigate(Routes.quizResult(result.id))}><span><strong>{result.questionSet?.label ?? 'Practice quiz'}</strong><small>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(result.takenAt)}</small></span><b>{result.correct}/{result.totalQuestions}</b><Icon name="chevronRight" size={16} /></button>)}</div>
            </section>}
          </div>;
        }}
      </AsyncBoundary>
    </Page>
  );
}

function PracticeOnlyToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={onChange}><span><strong>{label}</strong><small>{description}</small></span><i className={checked ? styles.practiceSwitchOn : styles.practiceSwitchOff}><span /></i></button>;
}
