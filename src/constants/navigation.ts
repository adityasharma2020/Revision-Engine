import type { IconName } from '../components/common/Icon';
import { Routes } from './routes';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
  readonly mobileLabel?: string;
  /** Match only the exact path (for the index route). */
  readonly end?: boolean;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { to: Routes.dashboard, label: 'Home', icon: 'home', end: true },
  { to: Routes.library, label: 'Library', icon: 'book' },
  { to: Routes.revision, label: 'Daily revision', mobileLabel: 'Revision', icon: 'target' },
  { to: Routes.search, label: 'Search', icon: 'search' },
  { to: Routes.import, label: 'Import', icon: 'plus' },
  { to: Routes.statistics, label: 'Statistics', mobileLabel: 'Stats', icon: 'chart' },
  { to: Routes.bookmarks, label: 'Bookmarks', mobileLabel: 'Saved', icon: 'bookmark' },
  { to: Routes.settings, label: 'Settings', icon: 'settings' },
];
