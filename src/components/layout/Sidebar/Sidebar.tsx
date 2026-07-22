import { NavLink } from 'react-router-dom';
import { APP_NAME } from '../../../constants/app';
import { PRIMARY_NAV } from '../../../constants/navigation';
import { Icon } from '../../common/Icon';
import { ThemeToggle } from '../../common/ThemeToggle';
import { cx } from '../../../utils/cx';
import styles from './Sidebar.module.css';

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.mark}>
          <Icon name="sparkle" size={18} />
        </span>
        <span className={styles.brandName}>{APP_NAME}</span>
      </div>

      <nav className={styles.nav} aria-label="Primary">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cx(styles.link, isActive && styles.active)}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
