import styles from './StatBreakdown.module.css';

export interface BreakdownRow {
  label: string;
  /** The bar's magnitude. */
  value: number;
  /** Scale maximum for this row's bar. */
  max: number;
  /** Text shown at the right (defaults to `value`). */
  display?: string;
  caption?: string;
  /** Optional HSL hue for the bar (e.g. subject colour); defaults to accent. */
  hue?: number;
}

/** Labelled horizontal bars — for subject / difficulty style breakdowns. */
export function StatBreakdown({ rows }: { rows: BreakdownRow[] }) {
  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <div className={styles.head}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.value}>{row.display ?? String(row.value)}</span>
          </div>
          <div className={styles.track}>
            <span
              className={styles.fill}
              style={{
                width: `${row.max <= 0 ? 0 : Math.min(100, (row.value / row.max) * 100)}%`,
                backgroundColor:
                  row.hue !== undefined ? `hsl(${row.hue} 55% 55%)` : 'var(--accent)',
              }}
            />
          </div>
          {row.caption && <span className={styles.caption}>{row.caption}</span>}
        </div>
      ))}
    </div>
  );
}
