import { Link, NavLink } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '../../../constants/app';
import { PRIMARY_NAV } from '../../../constants/navigation';
import { Routes } from '../../../constants/routes';
import { useAuth } from '../../../context/AuthContext';
import { Icon } from '../../common/Icon';
import { ThemeToggle } from '../../common/ThemeToggle';
import { UserAvatar } from '../../common/UserAvatar';
import { cx } from '../../../utils/cx';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  collapseLocked?: boolean;
  searchOpen?: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, collapseLocked = false, searchOpen = false, onToggle }: SidebarProps) {
  const { status, user } = useAuth();
  const signedIn = status === 'authenticated' && user;

  return (
    <aside className={cx(styles.sidebar, collapsed && styles.collapsedSidebar)}>
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={onToggle}
        disabled={collapseLocked}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapseLocked ? 'Sidebar stays compact in full screen' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name={collapsed ? 'panelLeftOpen' : 'panelLeftClose'} size={16} />
      </button>
      <Link to={Routes.dashboard} className={styles.brand} aria-label={`${APP_NAME} home`}>
        <span className={styles.mark}>
          <Icon name="sparkle" size={18} />
        </span>
        <span className={styles.brandName}>{APP_NAME}</span>
      </Link>

      <nav className={styles.nav} aria-label="Primary">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-label={item.label}
            aria-keyshortcuts={item.to === Routes.search ? 'Meta+Shift+P Control+Shift+P' : undefined}
            title={item.to === Routes.search ? 'Search (⌘⇧P or Ctrl⇧P)' : item.label}
            className={({ isActive }) => cx(
              styles.link,
              (isActive || (item.to === Routes.search && searchOpen)) && styles.active,
            )}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <Link to={Routes.settings} className={styles.account}>
          {signedIn ? (
            <UserAvatar
              src={user.avatarUrl}
              name={user.displayName}
              email={user.email}
              className={styles.accountAvatar}
              fallbackClassName={styles.accountAvatarFallback}
            />
          ) : (
            <span className={styles.accountAvatarFallback}>
              <Icon name="user" size={15} />
            </span>
          )}
          <span className={styles.accountText}>
            {signedIn ? (user.displayName ?? user.email) : 'Guest — sign in'}
          </span>
        </Link>
        <ThemeToggle />
      </div>
      <span className={styles.version} title={`Revision Engine version ${APP_VERSION}`}>
        v{APP_VERSION}
      </span>
    </aside>
  );
}
