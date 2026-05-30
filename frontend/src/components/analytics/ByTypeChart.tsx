import { Skeleton } from "@/components/ui/skeleton";
import { useRecharts } from "./useRecharts";
import {
  CHART_TOOLTIP_STYLE,
  type ByTypePoint,
  type ChartLabels,
} from "./chart-types";

export function ByTypeChart({
  data,
  labels,
}: {
  data: ByTypePoint[];
  labels: ChartLabels;
}) {
  const recharts = useRecharts();
  if (!recharts) return <Skeleton className="size-full" />;
  const {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } = recharts;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="type" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend />
        <Bar dataKey="success" name={labels.success} stackId="a" fill="hsl(142 71% 45%)" />
        <Bar dataKey="error" name={labels.error} stackId="a" fill="hsl(0 84% 60%)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
