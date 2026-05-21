import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Supervision</h1>
          <p className="text-sm text-muted-foreground">
            Live state of the print bridge and the connected thermal printer.
          </p>
        </div>
        <Button onClick={runTestPrint} disabled={printing}>
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
          value={
            health?.printer.reachable ? (
              <Badge variant="success">reachable</Badge>
            ) : (
              <Badge variant="destructive">unreachable</Badge>
            )
          }
          hint={`${health?.printer.host ?? "—"}:${health?.printer.port ?? "—"}`}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Success rate"
          value={`${totals.success_rate.toFixed(1)}%`}
          hint={`${totals.success}/${totals.all} jobs total`}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Last 24 h"
          value={`${last24h.success + last24h.error}`}
          hint={`${last24h.success} ok · ${last24h.error} errors`}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="Avg duration"
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold">
                    {timeAgo(summary.last_job.ts)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {summary.last_job.job_type} — {summary.last_job.status}
                  </p>
                </div>
                {summary.last_job.status === "success" ? (
                  <CheckCircle2 className="h-10 w-10 text-success" />
                ) : (
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No jobs recorded yet — send something to /print/* or run a test print.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common operator tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/test">Send a custom print</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/analytics">Open analytics</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/jobs">Inspect job history</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/settings">Edit configuration</Link>
            </Button>
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
            <p className="text-sm text-muted-foreground">No errors recorded — nice.</p>
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
