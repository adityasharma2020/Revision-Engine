import { lazy, Suspense } from 'react';
import { Route, Routes as RouterRoutes } from 'react-router-dom';
import { ErrorBoundary, FirstVisitTour } from './components/common';
import { AppShell } from './components/layout';
import { Routes } from './constants/routes';
import { Bookmarks } from './pages/Bookmarks';
import { Chapter } from './pages/Chapter';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { NotFound } from './pages/NotFound';
import { Settings } from './pages/Settings';
import { Search } from './pages/Search';
import { QuizResultPage } from './pages/QuizResult';
import { SharedQuizResultPage } from './pages/SharedQuizResult';
import { Library } from './pages/Library';
import { DailyRevision } from './pages/DailyRevision';
import { QuizSessionPage } from './pages/QuizSession';
import { Nudges } from './pages/Nudges';

const Statistics = lazy(() =>
  import('./pages/Statistics').then((module) => ({ default: module.Statistics })),
);

/** Route table. All app pages render inside the persistent AppShell. */
export function App() {
  return (
    <ErrorBoundary>
      <FirstVisitTour />
      <RouterRoutes>
        <Route element={<AppShell />}>
          <Route path={Routes.dashboard} element={<Dashboard />} />
          <Route path={Routes.library} element={<Library />} />
          <Route path={Routes.revision} element={<DailyRevision />} />
          <Route path={Routes.quizSession()} element={<QuizSessionPage />} />
          <Route path={Routes.search} element={<Search />} />
          <Route path={Routes.chapter()} element={<Chapter />} />
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
          <Route path="*" element={<NotFound />} />
        </Route>
      </RouterRoutes>
    </ErrorBoundary>
  );
}
