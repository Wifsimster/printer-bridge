import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  // `undefined` until the first fetch resolves; loading is derived from it.
  const [jobs, setJobs] = useState<Job[] | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const loading = jobs === undefined;

  const load = useCallback(
    async (nextFilter: Filter) => {
      try {
        const params = nextFilter === "all" ? {} : { status: nextFilter };
        const result = await endpoints.jobs({ limit: 200, ...params });
        setJobs(result.jobs);
      } catch {
        toast.error(t("jobs.loadFailed"));
        setJobs([]);
      }
    },
    [t]
  );

  // Fetch once on mount; subsequent fetches are driven by the filter/refresh
  // handlers below rather than by an effect that mirrors `filter` into state.
  useEffect(() => {
    load("all");
  }, [load]);

  function changeFilter(next: Filter) {
    setFilter(next);
    load(next);
  }

  function refresh() {
    load(filter);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("jobs.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("jobs.description")}</p>
        </div>
        <Button variant="outline" onClick={refresh} className="w-full sm:w-auto">
          <RefreshCw className="mr-2 size-4" /> {t("common.refresh")}
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle>{t("jobs.tableTitle")}</CardTitle>
            <CardDescription>{t("jobs.tableDesc")}</CardDescription>
          </div>
          <Tabs
            value={filter}
            onValueChange={(v) => changeFilter(v as Filter)}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="all" className="flex-1 sm:flex-none">
                {t("jobs.filterAll")}
              </TabsTrigger>
              <TabsTrigger value="success" className="flex-1 sm:flex-none">
                {t("jobs.filterSuccess")}
              </TabsTrigger>
              <TabsTrigger value="error" className="flex-1 sm:flex-none">
                {t("jobs.filterError")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {loading ? (
            <div className="space-y-2 px-6 sm:px-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("jobs.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("jobs.colWhen")}</TableHead>
                  <TableHead>{t("jobs.colType")}</TableHead>
                  <TableHead>{t("jobs.colStatus")}</TableHead>
                  <TableHead>{t("jobs.colDuration")}</TableHead>
                  <TableHead>{t("jobs.colAttempts")}</TableHead>
                  <TableHead>{t("jobs.colSource")}</TableHead>
                  <TableHead>{t("jobs.colDetail")}</TableHead>
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
                        <Badge variant="success">{t("jobs.statusSuccess")}</Badge>
                      ) : (
                        <Badge variant="destructive">{t("jobs.statusError")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDuration(j.duration_ms)}</TableCell>
                    <TableCell>{j.attempts ?? t("common.dash")}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {j.source ?? t("common.dash")}
                    </TableCell>
                    <TableCell className="max-w-xs font-mono text-xs text-muted-foreground">
                      {j.error ?? j.payload_summary ?? t("common.dash")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
