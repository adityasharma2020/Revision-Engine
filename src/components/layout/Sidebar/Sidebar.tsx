import { Link, NavLink } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '../../../constants/app';
import { PRIMARY_NAV } from '../../../constants/navigation';
import { Routes } from '../../../constants/routes';
import { useAuth } from '../../../context/AuthContext';
import { Icon } from '../../common/Icon';
import { ThemeToggle } from '../../common/ThemeToggle';
import { cx } from '../../../utils/cx';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const { status, user } = useAuth();
  const signedIn = status === 'authenticated' && user;

  return (
    <aside className={styles.sidebar}>
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
            title={item.label}
            className={({ isActive }) => cx(styles.link, isActive && styles.active)}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <Link to={Routes.settings} className={styles.account}>
          {signedIn && user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className={styles.accountAvatar} />
          ) : (
            <span className={styles.accountAvatarFallback}>
              {signedIn ? (
                (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()
              ) : (
                <Icon name="user" size={15} />
              )}
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
