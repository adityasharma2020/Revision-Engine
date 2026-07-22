import type { IconName } from '../../common/Icon';
import { Icon } from '../../common/Icon';
import styles from './StatTile.module.css';

interface StatTileProps {
  label: string;
  value: string;
  icon?: IconName;
  sublabel?: string;
}

/** A single headline metric. A stat tile is the right form for one number. */
export function StatTile({ label, value, icon, sublabel }: StatTileProps) {
  return (
    <div className={styles.tile}>
      {icon && (
        <span className={styles.icon}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      {sublabel && <span className={styles.sublabel}>{sublabel}</span>}
    </div>
  );
}
