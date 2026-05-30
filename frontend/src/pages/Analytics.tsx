import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { JobsOverTimeChart } from "@/components/analytics/JobsOverTimeChart";
import { ByTypeChart } from "@/components/analytics/ByTypeChart";
import { OverallPieChart } from "@/components/analytics/OverallPieChart";
import { AnalyticsSummary, endpoints, TimeseriesResponse } from "@/lib/api";

type AnalyticsData = {
  summary: AnalyticsSummary | null;
  series: TimeseriesResponse | null;
};

export function Analytics() {
  const { t, i18n } = useTranslation();
  const [hours, setHours] = useState(24);
  // `undefined` represents the not-yet-loaded state; the loading flag is derived
  // from it during render instead of being mirrored into a second state value.
  // Keyed by `hours` so changing the range resets to the loading state without a
  // separate setState in the effect.
  const [data, setData] = useState<{
    hours: number;
    value: AnalyticsData;
  } | null>(null);
  const loading = data?.hours !== hours;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let value: AnalyticsData;
      try {
        const [summary, series] = await Promise.all([
          endpoints.analyticsSummary(),
          endpoints.timeseries(hours),
        ]);
        value = { summary, series };
      } catch {
        if (cancelled) return;
        toast.error(t("analytics.loadFailed"));
        value = { summary: null, series: null };
      }
      if (!cancelled) setData({ hours, value });
    })();
    return () => {
      cancelled = true;
    };
  }, [hours, t]);

  const summary = data?.value.summary ?? null;
  const series = data?.value.series ?? null;

  const seriesData = useMemo(() => {
    if (!series) return [];
    const isHourly = series.bucket_seconds === 3600;
    return series.series.map((row) => ({
      ts: row.ts,
      label: new Date(row.ts * 1000).toLocaleString(i18n.language, {
        hour: isHourly ? "2-digit" : undefined,
        day: "2-digit",
        month: "short",
      }),
      success: row.success,
      error: row.error,
    }));
  }, [series, i18n.language]);

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
      { name: t("analytics.success"), value: summary.totals.success },
      { name: t("analytics.error"), value: summary.totals.error },
    ];
  }, [summary, t]);

  const chartLabels = useMemo(
    () => ({ success: t("analytics.success"), error: t("analytics.error") }),
    [t]
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("analytics.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("analytics.description")}</p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle>{t("analytics.jobsOverTimeTitle")}</CardTitle>
            <CardDescription>{t("analytics.jobsOverTimeDesc")}</CardDescription>
          </div>
          <Tabs
            value={String(hours)}
            onValueChange={(v) => setHours(Number(v))}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="24" className="flex-1 sm:flex-none">{t("analytics.tab24h")}</TabsTrigger>
              <TabsTrigger value="48" className="flex-1 sm:flex-none">{t("analytics.tab48h")}</TabsTrigger>
              <TabsTrigger value="168" className="flex-1 sm:flex-none">{t("analytics.tab7d")}</TabsTrigger>
              <TabsTrigger value="720" className="flex-1 sm:flex-none">{t("analytics.tab30d")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="h-56 sm:h-72">
          {loading ? (
            <Skeleton className="size-full" />
          ) : (
            <JobsOverTimeChart data={seriesData} labels={chartLabels} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.byTypeTitle")}</CardTitle>
            <CardDescription>{t("analytics.byTypeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-56 sm:h-64">
            {loading ? (
              <Skeleton className="size-full" />
            ) : byTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
            ) : (
              <ByTypeChart data={byTypeData} labels={chartLabels} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.overallTitle")}</CardTitle>
            <CardDescription>{t("analytics.overallDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-56 sm:h-64">
            {loading ? (
              <Skeleton className="size-full" />
            ) : pieData.every((d) => d.value === 0) ? (
              <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
            ) : (
              <OverallPieChart data={pieData} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat label={t("analytics.lifetimeJobs")} value={summary?.totals.all ?? 0} />
        <SmallStat label={t("analytics.successes")} value={summary?.totals.success ?? 0} />
        <SmallStat label={t("analytics.errors")} value={summary?.totals.error ?? 0} />
        <SmallStat
          label={t("analytics.successRate")}
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
