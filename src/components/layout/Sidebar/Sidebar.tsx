import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '../../../constants/app';
import { PRIMARY_NAV } from '../../../constants/navigation';
import { Routes } from '../../../constants/routes';
import { useAuth } from '../../../context/AuthContext';
import { Icon } from '../../common/Icon';
import { DisplayQuickSettings } from '../../common/DisplayQuickSettings';
import { UserAvatar } from '../../common/UserAvatar';
import { cx } from '../../../utils/cx';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  searchOpen?: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, searchOpen = false, onToggle }: SidebarProps) {
  const { status, user } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const signedIn = status === 'authenticated' && user;
  const mobilePrimary = new Set<string>([Routes.dashboard, Routes.library, Routes.revision, Routes.practice, Routes.search]);
  const moreItems = PRIMARY_NAV.filter((item) => !mobilePrimary.has(item.to));
  const moreActive = moreItems.some((item) => location.pathname === item.to);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  return (
    <aside className={cx(styles.sidebar, collapsed && styles.collapsedSidebar)}>
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
          <Fragment key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            aria-label={item.label}
            data-tour={item.to === Routes.search ? 'global-search' : item.to === Routes.nudges ? 'memory-nudges' : undefined}
            aria-keyshortcuts={item.to === Routes.search ? 'Meta+Shift+P Control+Shift+P' : undefined}
            title={item.to === Routes.search ? 'Search (⌘⇧P or Ctrl⇧P)' : item.label}
            className={({ isActive }) => cx(
              styles.link,
              item.featured && styles.featured,
              !mobilePrimary.has(item.to) && styles.mobileSecondary,
              (isActive || (item.to === Routes.search && searchOpen)) && styles.active,
            )}
          >
            <Icon name={item.icon} size={18} />
            <span className={styles.desktopLabel}>{item.label}</span>
            <span className={styles.mobileLabel}>{item.mobileLabel ?? item.label}</span>
          </NavLink>
          {item.to === Routes.statistics && <button
            type="button"
            className={cx(styles.link, styles.focusNavAction, styles.mobileSecondary)}
            onClick={() => window.dispatchEvent(new CustomEvent('revision-engine:open-focus-timer'))}
            aria-label="Open Focus Timer"
            title="Open Focus Timer"
          >
            <Icon name="clock" size={18} />
            <span className={styles.desktopLabel}>Focus Timer</span>
          </button>}
          </Fragment>
        ))}
        <button
          type="button"
          className={cx(styles.link, styles.moreButton, (moreOpen || moreActive) && styles.active)}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
        >
          <Icon name="more" size={18} />
          <span className={styles.mobileLabel}>More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button type="button" className={styles.moreBackdrop} aria-label="Close more navigation" onClick={() => setMoreOpen(false)} />
          <section id="mobile-more-menu" className={styles.moreSheet} aria-label="More pages">
            <div className={styles.moreHandle} />
            <div className={styles.moreHead}>
              <strong>More</strong>
              <div className={styles.moreHeadActions}>
                <DisplayQuickSettings fullscreenOnly onFullscreenToggle={() => setMoreOpen(false)} />
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close"><Icon name="close" size={19} /></button>
              </div>
            </div>
            <div className={styles.moreGrid}>
              {moreItems.map((item) => (
              <Fragment key={item.to}>
              <NavLink key={item.to} to={item.to} className={({ isActive }) => cx(styles.moreItem, item.featured && styles.moreItemFeatured, isActive && styles.moreItemActive)}>
                <span><Icon name={item.icon} size={20} /></span><strong>{item.label}</strong><Icon name="chevronRight" size={16} />
              </NavLink>
              {item.to === Routes.statistics && <button type="button" className={cx(styles.moreItem, styles.moreFocusItem)} onClick={() => { setMoreOpen(false); window.dispatchEvent(new CustomEvent('revision-engine:open-focus-timer')); }}>
                <span><Icon name="clock" size={20} /></span><strong>Focus Timer</strong><Icon name="chevronRight" size={16} />
              </button>}
              </Fragment>
            ))}</div>
          </section>
        </>
      )}

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
        <DisplayQuickSettings fullscreenOnly labelled />
      </div>
      <span className={styles.version} title={`Revision Engine version ${APP_VERSION}`}>
        v{APP_VERSION}
      </span>
    </aside>
  );
}
