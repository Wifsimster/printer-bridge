import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsSummary, endpoints, TimeseriesResponse } from "@/lib/api";

const COLORS = ["hsl(221 83% 53%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(280 67% 55%)"];

export function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [hours, setHours] = useState(24);
  const [series, setSeries] = useState<TimeseriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      endpoints.analyticsSummary(),
      endpoints.timeseries(hours),
    ])
      .then(([s, t]) => {
        setSummary(s);
        setSeries(t);
      })
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [hours]);

  const seriesData = useMemo(() => {
    if (!series) return [];
    const isHourly = series.bucket_seconds === 3600;
    return series.series.map((row) => ({
      ts: row.ts,
      label: new Date(row.ts * 1000).toLocaleString(undefined, {
        hour: isHourly ? "2-digit" : undefined,
        day: "2-digit",
        month: "short",
      }),
      success: row.success,
      error: row.error,
    }));
  }, [series]);

  const byTypeData = useMemo(() => {
    if (!summary) return [];
    const map = new Map<string, { type: string; success: number; error: number }>();
    summary.by_type_7d.forEach((row) => {
      const entry = map.get(row.job_type) ?? {
        type: row.job_type,
        success: 0,
        error: 0,
      };
      if (row.status === "success") entry.success = row.n;
      else entry.error = row.n;
      map.set(row.job_type, entry);
    });
    return Array.from(map.values());
  }, [summary]);

  const pieData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Success", value: summary.totals.success },
      { name: "Error", value: summary.totals.error },
    ];
  }, [summary]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Print job throughput, type breakdown, and success-rate trends.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Jobs over time</CardTitle>
            <CardDescription>Hourly buckets up to 48 h; daily after.</CardDescription>
          </div>
          <Tabs value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <TabsList>
              <TabsTrigger value="24">24 h</TabsTrigger>
              <TabsTrigger value="48">48 h</TabsTrigger>
              <TabsTrigger value="168">7 d</TabsTrigger>
              <TabsTrigger value="720">30 d</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="h-72">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seriesData}>
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
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="success"
                  stroke="hsl(142 71% 45%)"
                  fill="url(#successGrad)"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="error"
                  stroke="hsl(0 84% 60%)"
                  fill="url(#errorGrad)"
                  stackId="1"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By job type (7d)</CardTitle>
            <CardDescription>
              Volume per endpoint over the last week.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : byTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" stackId="a" fill="hsl(142 71% 45%)" />
                  <Bar dataKey="error" stackId="a" fill="hsl(0 84% 60%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overall outcome</CardTitle>
            <CardDescription>
              Lifetime success vs. error split.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : pieData.every((d) => d.value === 0) ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={80}
                    innerRadius={40}
                    label
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat
          label="Lifetime jobs"
          value={summary?.totals.all ?? 0}
        />
        <SmallStat
          label="Successes"
          value={summary?.totals.success ?? 0}
        />
        <SmallStat
          label="Errors"
          value={summary?.totals.error ?? 0}
        />
        <SmallStat
          label="Success rate"
          value={`${(summary?.totals.success_rate ?? 0).toFixed(2)}%`}
        />
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
