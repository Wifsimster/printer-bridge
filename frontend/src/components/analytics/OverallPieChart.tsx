import { Skeleton } from "@/components/ui/skeleton";
import { useRecharts } from "./useRecharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, type PiePoint } from "./chart-types";

// Attach each slice its palette color by position so the array index never
// leaks into a JSX key.
function withColors(items: PiePoint[]): (PiePoint & { color: string })[] {
  return items.map((item, i) => ({
    ...item,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export function OverallPieChart({ data }: { data: PiePoint[] }) {
  const recharts = useRecharts();
  if (!recharts) return <Skeleton className="size-full" />;
  const { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } = recharts;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} label>
          {withColors(data).map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
