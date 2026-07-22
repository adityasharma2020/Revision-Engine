import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
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

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as BarDatum | undefined;
  if (!point) return null;
  return (
    <div className={styles.tooltip} role="status">
      {point.tooltip ?? `${point.label}: ${point.value}`}
    </div>
  );
}

/** Responsive Recharts bar chart with a real anchored hover/touch tooltip. */
export function BarChart({
  data,
  max,
  valueSuffix = '',
  gridValues,
  showValues,
}: BarChartProps) {
  const scaleMax = Math.max(1, max ?? Math.max(...data.map((point) => point.value), 1));
  const labelled = showValues ?? data.length <= 12;

  return (
    <figure className={styles.figure} aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          margin={{ top: 22, right: 8, bottom: 4, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={24}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
          />
          <YAxis
            width={38}
            axisLine={false}
            tickLine={false}
            domain={[0, scaleMax]}
            ticks={gridValues}
            tickFormatter={(value: number) => `${value}${valueSuffix}`}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
          />
          <Tooltip
            content={ChartTooltip}
            cursor={{ fill: 'var(--surface-hover)', opacity: 0.6 }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="value"
            fill="var(--accent)"
            radius={[5, 5, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          >
            {labelled && (
              <LabelList
                dataKey="value"
                position="top"
                fill="var(--text-secondary)"
                fontSize={11}
                fontWeight={600}
              />
            )}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </figure>
  );
}
