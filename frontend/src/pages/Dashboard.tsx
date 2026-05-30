import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Printer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AnalyticsSummary, endpoints, HealthResponse } from "@/lib/api";
import { formatDuration, timeAgo } from "@/lib/utils";

export function Dashboard() {
  const { t } = useTranslation();
  // `undefined` means the first load has not resolved yet; the loading flag is
  // derived from it during render instead of being stored separately.
  const [summary, setSummary] = useState<AnalyticsSummary | null | undefined>(
    undefined
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [printing, setPrinting] = useState(false);
  const loading = summary === undefined;

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        endpoints.analyticsSummary(),
        endpoints.health(),
      ]);
      setSummary(s);
      setHealth(h);
    } catch (err) {
      toast.error(t("dashboard.loadFailed"));
      console.error(err);
      setSummary(null);
    }
  }, [t]);

  async function runTestPrint() {
    setPrinting(true);
    try {
      await endpoints.printTest();
      toast.success(t("dashboard.testJobSent"));
      refresh();
    } catch (err) {
      toast.error(t("dashboard.printFailed", { message: (err as Error).message }));
    } finally {
      setPrinting(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const totals = summary?.totals ?? { success: 0, error: 0, all: 0, success_rate: 0 };
  const last24h = summary?.last_24h ?? { success: 0, error: 0 };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.description")}</p>
        </div>
        <Button onClick={runTestPrint} disabled={printing} className="w-full sm:w-auto">
          <Zap className="mr-2 size-4" />
          {printing ? t("dashboard.sending") : t("dashboard.runTestPrint")}
        </Button>
      </header>

      {health && !health.printer.reachable && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t("dashboard.printerUnreachableTitle")}</AlertTitle>
          <AlertDescription>
            {t("dashboard.printerUnreachableDesc", {
              host: health.printer.host,
              port: health.printer.port,
            })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Printer className="size-4" />}
          label={t("dashboard.statPrinter")}
          value={
            health?.printer.reachable ? (
              <Badge variant="success">{t("header.reachable")}</Badge>
            ) : (
              <Badge variant="destructive">{t("header.unreachable")}</Badge>
            )
          }
          hint={`${health?.printer.host ?? t("common.dash")}:${health?.printer.port ?? t("common.dash")}`}
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label={t("dashboard.statSuccessRate")}
          value={`${totals.success_rate.toFixed(1)}%`}
          hint={t("dashboard.statSuccessRateHint", { success: totals.success, all: totals.all })}
        />
        <Stat
          icon={<Activity className="size-4" />}
          label={t("dashboard.statLast24h")}
          value={`${last24h.success + last24h.error}`}
          hint={t("dashboard.statLast24hHint", { success: last24h.success, error: last24h.error })}
        />
        <Stat
          icon={<Clock className="size-4" />}
          label={t("dashboard.statAvgDuration")}
          value={formatDuration(summary?.avg_duration_ms_7d ?? 0)}
          hint={t("dashboard.statAvgDurationHint")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.lastJobTitle")}</CardTitle>
            <CardDescription>{t("dashboard.lastJobDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {summary?.last_job ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold">
                    {timeAgo(summary.last_job.ts)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {summary.last_job.job_type}: {summary.last_job.status}
                  </p>
                </div>
                {summary.last_job.status === "success" ? (
                  <CheckCircle2 className="size-10 text-success" />
                ) : (
                  <AlertTriangle className="size-10 text-destructive" />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("dashboard.noJobsYet")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.quickActionsTitle")}</CardTitle>
            <CardDescription>{t("dashboard.quickActionsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/admin/test">{t("dashboard.actionCustomPrint")}</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/admin/analytics">{t("dashboard.actionOpenAnalytics")}</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/admin/jobs">{t("dashboard.actionInspectJobs")}</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/admin/settings">{t("dashboard.actionEditConfig")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.recentErrorsTitle")}</CardTitle>
          <CardDescription>{t("dashboard.recentErrorsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {summary?.recent_errors.length ? (
            <ul className="space-y-3">
              {summary.recent_errors.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 rounded-md border bg-muted/20 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{e.job_type}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {e.error}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(e.ts)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboard.noErrors")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
