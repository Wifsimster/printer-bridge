import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { endpoints, Job } from "@/lib/api";
import { formatDuration, formatTimestamp } from "@/lib/utils";

type Filter = "all" | "success" | "error";

export function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = filter === "all" ? {} : { status: filter };
      const result = await endpoints.jobs({ limit: 200, ...params });
      setJobs(result.jobs);
    } catch {
      toast.error("Could not load jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job history</h1>
          <p className="text-sm text-muted-foreground">
            Last 200 print jobs recorded in the local SQLite store.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Print jobs</CardTitle>
            <CardDescription>
              Newest first. Source includes client IP and a truncated User-Agent.
            </CardDescription>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="success">Success</TabsTrigger>
              <TabsTrigger value="error">Error</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No jobs to show.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {formatTimestamp(j.ts)}
                    </TableCell>
                    <TableCell>{j.job_type}</TableCell>
                    <TableCell>
                      {j.status === "success" ? (
                        <Badge variant="success">success</Badge>
                      ) : (
                        <Badge variant="destructive">error</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDuration(j.duration_ms)}</TableCell>
                    <TableCell>{j.attempts ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {j.source ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs font-mono text-xs text-muted-foreground">
                      {j.error ?? j.payload_summary ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
