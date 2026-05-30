import { Skeleton } from "@/components/ui/skeleton";
import { useRecharts } from "./useRecharts";
import {
  CHART_TOOLTIP_STYLE,
  type ChartLabels,
  type SeriesPoint,
} from "./chart-types";

export function JobsOverTimeChart({
  data,
  labels,
}: {
  data: SeriesPoint[];
  labels: ChartLabels;
}) {
  const recharts = useRecharts();
  if (!recharts) return <Skeleton className="size-full" />;
  const {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } = recharts;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend />
        <Area
          type="monotone"
          dataKey="success"
          name={labels.success}
          stroke="hsl(142 71% 45%)"
          fill="url(#successGrad)"
          stackId="1"
        />
        <Area
          type="monotone"
          dataKey="error"
          name={labels.error}
          stroke="hsl(0 84% 60%)"
          fill="url(#errorGrad)"
          stackId="1"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
