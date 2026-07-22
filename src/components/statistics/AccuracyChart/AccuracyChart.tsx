import { useMemo } from 'react';
import type { TrendPoint } from '../../../utils/statistics';
import styles from './AccuracyChart.module.css';

interface AccuracyChartProps {
  data: TrendPoint[];
}

const H = 200;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;
const BAR_W = 22;
const SLOT = 44;

/** Round only the top (data end) of a baseline-anchored bar. */
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

/**
 * Accuracy per quiz over time — a single-series bar chart on the app accent.
 * One measure, one hue: no legend, recessive axes, values labelled directly.
 */
export function AccuracyChart({ data }: AccuracyChartProps) {
  const width = useMemo(() => Math.max(320, data.length * SLOT + 24), [data.length]);
  const gridY = [0, 50, 100];
  const y = (value: number) => PAD_TOP + PLOT_H * (1 - value / 100);
  const showValues = data.length <= 12;

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="Accuracy per quiz over time"
        preserveAspectRatio="xMidYMid meet"
      >
        {gridY.map((g) => (
          <g key={g}>
            <line
              x1={0}
              x2={width}
              y1={y(g)}
              y2={y(g)}
              className={styles.grid}
            />
            <text x={0} y={y(g) - 4} className={styles.axisLabel}>
              {g}%
            </text>
          </g>
        ))}

        {data.map((point, i) => {
          const cx = 24 + i * SLOT + (SLOT - BAR_W) / 2;
          const barH = (point.accuracy / 100) * PLOT_H;
          const barY = PAD_TOP + PLOT_H - barH;
          return (
            <g key={point.takenAt} className={styles.bar}>
              <title>{`${point.label} · ${point.correct}/${point.total} correct · ${point.accuracy}%`}</title>
              {/* invisible full-height hit target for hover */}
              <rect x={24 + i * SLOT} y={PAD_TOP} width={SLOT} height={PLOT_H} fill="transparent" />
              <path d={topRoundedBar(cx, barY, BAR_W, Math.max(barH, 2), 4)} className={styles.fill} />
              {showValues && (
                <text x={cx + BAR_W / 2} y={barY - 6} className={styles.valueLabel}>
                  {point.accuracy}
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
