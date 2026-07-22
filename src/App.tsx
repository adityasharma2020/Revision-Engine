import { Route, Routes as RouterRoutes } from 'react-router-dom';
import { ErrorBoundary } from './components/common';
import { AppShell } from './components/layout';
import { Routes } from './constants/routes';
import { Bookmarks } from './pages/Bookmarks';
import { Chapter } from './pages/Chapter';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { NotFound } from './pages/NotFound';
import { Settings } from './pages/Settings';
import { Search } from './pages/Search';
import { Statistics } from './pages/Statistics';
import { QuizResultPage } from './pages/QuizResult';

/** Route table. All app pages render inside the persistent AppShell. */
export function App() {
  return (
    <ErrorBoundary>
      <RouterRoutes>
        <Route element={<AppShell />}>
          <Route path={Routes.dashboard} element={<Dashboard />} />
          <Route path={Routes.search} element={<Search />} />
          <Route path={Routes.chapter()} element={<Chapter />} />
          <Route path={Routes.quizResult()} element={<QuizResultPage />} />
          <Route path={Routes.import} element={<Import />} />
          <Route path={Routes.statistics} element={<Statistics />} />
          <Route path={Routes.bookmarks} element={<Bookmarks />} />
          <Route path={Routes.settings} element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </RouterRoutes>
    </ErrorBoundary>
  );
}
