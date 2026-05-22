import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
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
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "info" | "warning";

export function Dashboard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  async function refresh() {
    try {
      const [s, h] = await Promise.all([
        endpoints.analyticsSummary(),
        endpoints.health(),
      ]);
      setSummary(s);
      setHealth(h);
    } catch (err) {
      toast.error("Failed to load dashboard");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);

  async function runTestPrint() {
    setPrinting(true);
    try {
      await endpoints.printTest();
      toast.success("Test job sent");
      refresh();
    } catch (err) {
      toast.error("Print failed: " + (err as Error).message);
    } finally {
      setPrinting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const totals = summary?.totals ?? { success: 0, error: 0, all: 0, success_rate: 0 };
  const last24h = summary?.last_24h ?? { success: 0, error: 0 };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Supervision
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live state of the print bridge and the connected thermal printer.
          </p>
        </div>
        <Button onClick={runTestPrint} disabled={printing} className="shadow-soft">
          <Zap className="mr-2 h-4 w-4" />
          {printing ? "Sending…" : "Run test print"}
        </Button>
      </header>

      {health && !health.printer.reachable && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Printer unreachable</AlertTitle>
          <AlertDescription>
            TCP {health.printer.host}:{health.printer.port} did not answer. Check the
            VLAN/firewall path and that the printer is powered on.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Printer className="h-4 w-4" />}
          label="Printer"
          tone={health?.printer.reachable ? "success" : "warning"}
          value={
            health?.printer.reachable ? (
              <span className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-success" />
                Online
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-destructive" />
                Offline
              </span>
            )
          }
          hint={`${health?.printer.host ?? "—"}:${health?.printer.port ?? "—"}`}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Success rate"
          tone="primary"
          value={`${totals.success_rate.toFixed(1)}%`}
          hint={`${totals.success}/${totals.all} jobs total`}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Last 24 h"
          tone="info"
          value={`${last24h.success + last24h.error}`}
          hint={`${last24h.success} ok · ${last24h.error} errors`}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="Avg duration"
          tone="primary"
          value={formatDuration(summary?.avg_duration_ms_7d ?? 0)}
          hint="Last 7 days, successful jobs"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Last successful job</CardTitle>
            <CardDescription>
              Heartbeat from the bridge. Stale &gt; 24 h usually means callers stopped,
              not that the printer is broken.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary?.last_job ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
                <div>
                  <p className="text-3xl font-semibold tracking-tight">
                    {timeAgo(summary.last_job.ts)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-mono">{summary.last_job.job_type}</span> ·{" "}
                    {summary.last_job.status}
                  </p>
                </div>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    summary.last_job.status === "success"
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                  )}
                >
                  {summary.last_job.status === "success" ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <AlertTriangle className="h-6 w-6" />
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Nothing printed yet"
                hint="Send something to /print/* or click Run test print."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common operator tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { to: "/test", label: "Send a custom print" },
              { to: "/analytics", label: "Open analytics" },
              { to: "/jobs", label: "Inspect job history" },
              { to: "/settings", label: "Edit configuration" },
            ].map((a) => (
              <Button
                key={a.to}
                variant="ghost"
                className="group w-full justify-between border border-transparent hover:border-border hover:bg-accent/40"
                asChild
              >
                <Link to={a.to}>
                  <span>{a.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent errors</CardTitle>
          <CardDescription>
            Last 10 failed jobs. Drill into the Jobs tab for more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary?.recent_errors.length ? (
            <ul className="space-y-2">
              {summary.recent_errors.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 rounded-lg border border-destructive/20 bg-destructive-soft/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="font-medium">{e.job_type}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {e.error}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground sm:pl-3">
                    {timeAgo(e.ts)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No errors recorded"
              hint="Nice — the bridge has been smooth sailing."
              tone="success"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const toneStyles: Record<
  Tone,
  { ring: string; iconBg: string; iconText: string }
> = {
  primary: {
    ring: "ring-1 ring-primary/10",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
  },
  success: {
    ring: "ring-1 ring-success/10",
    iconBg: "bg-success/10",
    iconText: "text-success",
  },
  info: {
    ring: "ring-1 ring-info/10",
    iconBg: "bg-info/10",
    iconText: "text-info",
  },
  warning: {
    ring: "ring-1 ring-warning/10",
    iconBg: "bg-warning/15",
    iconText: "text-warning",
  },
};

function Stat({
  icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const styles = toneStyles[tone];
  return (
    <Card className={cn("overflow-hidden hover:shadow-medium", styles.ring)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              styles.iconBg,
              styles.iconText
            )}
          >
            {icon}
          </span>
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && (
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  hint,
  tone = "muted",
}: {
  title: string;
  hint?: string;
  tone?: "muted" | "success";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-8 text-center",
        tone === "success" && "border-success/30 bg-success-soft/40"
      )}
    >
      <p
        className={cn(
          "text-sm font-medium",
          tone === "success" ? "text-success" : "text-foreground"
        )}
      >
        {title}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
