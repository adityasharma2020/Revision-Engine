import { cx } from '../../../utils/cx';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly count?: number;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label'?: string;
}

/** Accessible segmented tab control. Generic over the tab id union. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          aria-selected={value === item.id}
          className={cx(styles.tab, value === item.id && styles.active)}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={styles.count}>{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
