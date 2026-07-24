import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes as RouterRoutes } from 'react-router-dom';
import { ErrorBoundary, FirstVisitTour } from './components/common';
import { AppShell } from './components/layout';
import { Routes } from './constants/routes';
import { Bookmarks } from './pages/Bookmarks';
import { Chapter } from './pages/Chapter';
import { ChapterEditor } from './pages/ChapterEditor';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { NotFound } from './pages/NotFound';
import { Settings } from './pages/Settings';
import { Search } from './pages/Search';
import { QuizResultPage } from './pages/QuizResult';
import { SharedQuizResultPage } from './pages/SharedQuizResult';
import { Library } from './pages/Library';
import { DailyRevision } from './pages/DailyRevision';
import { PracticeQuiz } from './pages/PracticeQuiz';
import { QuizSessionPage } from './pages/QuizSession';
import { Nudges } from './pages/Nudges';
import { PdfReader } from './pages/PdfReader';

const Statistics = lazy(() =>
  import('./pages/Statistics').then((module) => ({ default: module.Statistics })),
);

/** Route table. All app pages render inside the persistent AppShell. */
export function App() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let focusTimer = 0;
    const revealFocusedField = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement) || !field.matches('input, textarea, select, [contenteditable="true"]')) return;
        const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const bounds = field.getBoundingClientRect();
        if (bounds.bottom > visibleBottom - 20 || bounds.top < (viewport?.offsetTop ?? 0) + 12) {
          field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        }
      }, 120);
    };
    document.addEventListener('focusin', revealFocusedField);
    viewport?.addEventListener('resize', revealFocusedField);
    viewport?.addEventListener('scroll', revealFocusedField);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('focusin', revealFocusedField);
      viewport?.removeEventListener('resize', revealFocusedField);
      viewport?.removeEventListener('scroll', revealFocusedField);
    };
  }, []);

  return (
    <ErrorBoundary>
      <FirstVisitTour />
      <RouterRoutes>
        <Route element={<AppShell />}>
          <Route path={Routes.dashboard} element={<Dashboard />} />
          <Route path={Routes.library} element={<Library />} />
          <Route path={Routes.revision} element={<DailyRevision />} />
          <Route path={Routes.practice} element={<PracticeQuiz />} />
          <Route path={Routes.quizSession()} element={<QuizSessionPage />} />
          <Route path={Routes.search} element={<Search />} />
          <Route path={Routes.chapter()} element={<Chapter />} />
          <Route path={Routes.chapterEdit()} element={<ChapterEditor />} />
          <Route path={Routes.quizResult()} element={<QuizResultPage />} />
          <Route path={Routes.sharedQuizResult()} element={<SharedQuizResultPage />} />
          <Route path={Routes.import} element={<Import />} />
          <Route
            path={Routes.statistics}
            element={<Suspense fallback={null}><Statistics /></Suspense>}
          />
          <Route path={Routes.bookmarks} element={<Bookmarks />} />
          <Route path={Routes.settings} element={<Settings />} />
          <Route path={Routes.nudges} element={<Nudges />} />
          <Route path={Routes.pdfReader} element={<PdfReader />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </RouterRoutes>
    </ErrorBoundary>
  );
}
