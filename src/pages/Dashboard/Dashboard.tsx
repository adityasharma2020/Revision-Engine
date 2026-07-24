import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AsyncBoundary, Icon } from '../../components/common';
import { ChapterCard } from '../../components/dashboard/ChapterCard';
import { Page } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { useUserData } from '../../context/UserDataContext';
import { useLibrary } from '../../hooks/useChapters';
import type { ChapterSummary } from '../../types';
import styles from './Dashboard.module.css';
import { useRevisionPreferences } from '../../hooks/useRevisionPreferences';
import { useDailyRevisionAssignment } from '../../hooks/useDailyRevisionAssignment';
import { getQuizPerformance } from '../../utils/quizPerformance';
import { useSavedQuizSettings } from '../../hooks/useSavedQuizSettings';
import { hasQuizDraft, updateQuizDraftSettings } from '../../hooks/useQuizSession';
import { saveQuizDefinition } from '../../services/quiz';
import type { QuizSettings } from '../../types';
import { QuizLaunchDialog } from '../../components/quiz/QuizLaunchDialog';
import { ProgressOverview } from '../../components/dashboard/ProgressOverview';
import { useAppSettings } from '../../context/AppSettingsContext';
import { NotificationInbox } from '../../components/dashboard/NotificationInbox';

export function Dashboard() {
  const state = useLibrary();
  return (
    <Page narrow>
      <AsyncBoundary state={state} loadingLabel="Preparing your dashboard…">
        {(chapters) => <HomeContent chapters={chapters} />}
      </AsyncBoundary>
    </Page>
  );
}

function HomeContent({ chapters }: { chapters: readonly ChapterSummary[] }) {
  const { progress, quizResults } = useUserData();
  const { settings: appSettings } = useAppSettings();
  const navigate = useNavigate();
  const { preferences } = useRevisionPreferences();
  const { assignment, save: saveAssignment } = useDailyRevisionAssignment();
  const { settings: defaultQuizSettings } = useSavedQuizSettings();
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [quickSettings, setQuickSettings] = useState<QuizSettings>(defaultQuizSettings);
  const examDays = preferences.examDate
    ? Math.ceil((new Date(`${preferences.examDate}T23:59:59`).getTime() - Date.now()) / 86_400_000)
    : null;
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
  const revisionPerformance = assignment?.status === 'completed' && assignment.score
    ? getQuizPerformance(assignment.score.correct, assignment.score.total)
    : null;
  const continueChapter = recent[0] ?? chapters[0];
  const activeDraftExists = assignment?.status === 'active'
    ? hasQuizDraft(assignment.definition.id)
    : false;
  const openPreflight = () => {
    if (assignment?.status === 'completed') {
      navigate(Routes.revision);
      return;
    }
    setQuickSettings(assignment?.status === 'active' ? assignment.definition.settings : { ...defaultQuizSettings });
    setPreflightOpen(true);
  };
  const beginDailyRevision = () => {
    if (assignment?.status === 'active') {
      const definition = { ...assignment.definition, settings: quickSettings };
      saveQuizDefinition(definition);
      saveAssignment({ ...assignment, definition });
      if (!activeDraftExists) {
        navigate(Routes.quizSession(definition.id));
      } else {
        updateQuizDraftSettings(definition.id, quickSettings);
        navigate(Routes.quizSession(definition.id));
      }
    } else {
      navigate(`${Routes.revision}?autostart=1`);
    }
    setPreflightOpen(false);
  };
  return (
    <>
      <NotificationInbox />
      {appSettings.dashboard.showActivityOverview && <ProgressOverview results={quizResults} />}

      <button type="button" onClick={openPreflight} className={`${styles.revisionHero} ${revisionPerformance ? styles[`revision_${revisionPerformance.tone}`] : ''}`} data-tour="daily-revision">
        <span className={styles.revisionMark}><Icon name="target" size={25} /></span>
        <div className={styles.revisionMain}>
          <small>{assignment?.status === 'completed' ? '✅ Daily Revision · Completed today' : assignment?.status === 'active' ? '⏳ Daily Revision · Pending today' : 'Daily Revision · Your highest-priority study'}</small>
          <strong>{assignment?.status === 'completed' && revisionPerformance ? `${revisionPerformance.emoji} ${revisionPerformance.label}` : assignment?.status === 'completed' ? 'Today’s revision is complete' : assignment?.status === 'active' ? 'Finish what you started' : 'Review what matters today'}</strong>
          <span>{assignment?.status === 'completed' && assignment.score ? `${assignment.score.correct} correct out of ${assignment.score.total} questions · ${revisionPerformance?.accuracy ?? 0}% accuracy` : assignment?.status === 'active' ? `${assignment.definition.questions.length}-question quiz saved · resume where you left off` : `${preferences.includedChapterIds.length} studied chapters · ${preferences.dailyQuestionLimit}-question saved target`}</span>
        </div>
        {examDays !== null && examDays >= 0 && <div className={styles.countdown}><strong>{examDays}</strong><span>days to<br />{preferences.examName || 'your exam'}</span></div>}
        <span className={styles.revisionCta}>{assignment?.status === 'completed' ? 'View result' : assignment?.status === 'active' ? 'Continue' : 'Start now'} <Icon name="chevronRight" size={17} /></span>
      </button>

      <section className={styles.supportActions} aria-label="Study shortcuts">
        {continueChapter && (
          <Link to={Routes.chapter(continueChapter.id)} className={styles.continueCard}>
            <span className={styles.continueIcon}><Icon name="target" size={19} /></span>
            <div>
              <small>{recent.length > 0 ? 'Continue studying' : 'Start studying'}</small>
              <strong>{continueChapter.title}</strong>
              <span>{continueChapter.subject} · Chapter {continueChapter.chapterNumber}</span>
            </div>
            <Icon name="chevronRight" size={16} />
          </Link>
        )}
        <Action to={Routes.library} icon="book" title="Open library" text="Browse every subject and chapter." tour="library-shortcut" />
        <Action to={continueChapter ? Routes.chapter(continueChapter.id) : Routes.library} icon="clock" title="Take a quiz" text="Start a timed attempt with saved results." tour="quiz-shortcut" />
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
      {preflightOpen && (
        <QuizLaunchDialog
          title="Start Daily Revision"
          description={activeDraftExists ? 'This session already has saved progress, so its original settings are protected.' : 'Confirm the essential session settings. Your scheduling rules stay unchanged.'}
          settings={quickSettings}
          questionCount={assignment?.status === 'active' ? assignment.definition.questions.length : preferences.dailyQuestionLimit}
          settingsLocked={false}
          confirmLabel={activeDraftExists ? 'Resume saved quiz' : assignment?.status === 'active' ? 'Open saved quiz' : 'Build and start'}
          onSettingsChange={setQuickSettings}
          onCancel={() => setPreflightOpen(false)}
          onConfirm={beginDailyRevision}
        />
      )}
    </>
  );
}

function Action({ to, icon, title, text, tour }: {
  to: string;
  icon: 'book' | 'clock' | 'search' | 'target';
  title: string;
  text: string;
  tour?: string;
}) {
  return (
    <Link to={to} className={styles.action} data-tour={tour}>
      <span><Icon name={icon} size={19} /></span>
      <div><strong>{title}</strong><small>{text}</small></div>
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}
