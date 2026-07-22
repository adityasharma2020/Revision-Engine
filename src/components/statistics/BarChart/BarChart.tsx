import { useMemo } from 'react';
import styles from './BarChart.module.css';

export interface BarDatum {
  label: string;
  value: number;
  tooltip?: string;
}

interface BarChartProps {
  data: BarDatum[];
  /** Upper bound of the scale; defaults to the data max (min 1). */
  max?: number;
  valueSuffix?: string;
  /** Gridline values to draw + label on the y-axis. */
  gridValues?: number[];
  /** Print the value above each bar (auto-off when crowded). */
  showValues?: boolean;
}

const H = 200;
const PAD_TOP = 22;
const PAD_BOTTOM = 28;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;
const BAR_W = 22;
const SLOT = 40;

function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h, w / 2);
  const bottom = y + h;
  return [
    `M${x},${bottom}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${bottom}`,
    'Z',
  ].join(' ');
}

/** Single-series vertical bar chart on the app accent. Recessive axes, direct labels. */
export function BarChart({
  data,
  max,
  valueSuffix = '',
  gridValues,
  showValues,
}: BarChartProps) {
  const width = useMemo(() => Math.max(320, data.length * SLOT + 28), [data.length]);
  const scaleMax = Math.max(1, max ?? Math.max(...data.map((d) => d.value), 1));
  const y = (value: number) => PAD_TOP + PLOT_H * (1 - value / scaleMax);
  const grids = gridValues ?? [0, Math.round(scaleMax / 2), scaleMax];
  const labelled = showValues ?? data.length <= 12;

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="Bar chart"
        preserveAspectRatio="xMidYMid meet"
      >
        {grids.map((g) => (
          <g key={g}>
            <line x1={0} x2={width} y1={y(g)} y2={y(g)} className={styles.grid} />
            <text x={0} y={y(g) - 4} className={styles.axisLabel}>
              {g}
              {valueSuffix}
            </text>
          </g>
        ))}

        {data.map((point, i) => {
          const cx = 28 + i * SLOT + (SLOT - BAR_W) / 2;
          const barH = point.value <= 0 ? 0 : (point.value / scaleMax) * PLOT_H;
          const barY = PAD_TOP + PLOT_H - barH;
          return (
            <g key={`${point.label}-${i}`} className={styles.bar}>
              <title>{point.tooltip ?? `${point.label}: ${point.value}${valueSuffix}`}</title>
              <rect x={28 + i * SLOT} y={PAD_TOP} width={SLOT} height={PLOT_H} fill="transparent" />
              {barH > 0 && (
                <path d={topRoundedBar(cx, barY, BAR_W, Math.max(barH, 2), 4)} className={styles.fill} />
              )}
              {labelled && point.value > 0 && (
                <text x={cx + BAR_W / 2} y={barY - 6} className={styles.valueLabel}>
                  {point.value}
                </text>
              )}
              <text x={cx + BAR_W / 2} y={H - 8} className={styles.xLabel}>
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
