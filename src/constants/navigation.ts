import type { IconName } from '../components/common/Icon';
import { Routes } from './routes';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
  /** Match only the exact path (for the index route). */
  readonly end?: boolean;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { to: Routes.dashboard, label: 'Library', icon: 'home', end: true },
  { to: Routes.import, label: 'Import', icon: 'plus' },
  { to: Routes.statistics, label: 'Statistics', icon: 'chart' },
  { to: Routes.bookmarks, label: 'Bookmarks', icon: 'bookmark' },
  { to: Routes.settings, label: 'Settings', icon: 'settings' },
];
