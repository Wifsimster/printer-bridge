import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  PartyPopper,
  Printer,
  Radar,
  RefreshCw,
  TestTube2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, endpoints, type PrinterCandidate } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES } from "@/i18n";

type Step = 0 | 1 | 2 | 3 | 4;

function openPrinterWebUI(host: string) {
  const trimmed = host.trim();
  if (!trimmed) return;
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}/`;
  window.open(url, "_blank", "noopener,noreferrer");
}

interface Form {
  printer_host: string;
  printer_port: number;
  printer_codepage: string;
  printer_timeout: number;
  printer_retries: number;
  tz: string;
  printer_token: string;
  admin_email: string;
  admin_password: string;
  admin_password_confirm: string;
  admin_name: string;
}

const initialForm: Form = {
  printer_host: "",
  printer_port: 9100,
  printer_codepage: "CP858",
  printer_timeout: 20,
  printer_retries: 3,
  tz: "Europe/Paris",
  printer_token: "",
  admin_email: "",
  admin_password: "",
  admin_password_confirm: "",
  admin_name: "",
};

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<Form>(initialForm);
  const navigate = useNavigate();

  const stepTitles = [
    t("setup.stepWelcome"),
    t("setup.stepPrinter"),
    t("setup.stepAuth"),
    t("setup.stepVerify"),
    t("setup.stepDone"),
  ];

  const progress = ((step + 1) / stepTitles.length) * 100;

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function next() {
    setStep((s) => Math.min(4, s + 1) as Step);
  }
  function prev() {
    setStep((s) => Math.max(0, s - 1) as Step);
  }

  async function finish() {
    try {
      const { admin_password_confirm: _confirm, ...payload } = form;
      void _confirm;
      await endpoints.completeSetup(payload);
      try {
        await endpoints.signIn(form.admin_email, form.admin_password);
      } catch {
        // Auto sign-in is best-effort; users can sign in manually if it fails.
      }
      toast.success(t("setup.complete"));
      onComplete();
      navigate("/admin", { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("setup.failed");
      toast.error(msg);
    }
  }

  const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

  return (
    <div className="app-shell-bg min-h-screen px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-3xl animate-fade-in">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-medium sm:size-11">
              <Printer className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{t("setup.headerTitle")}</h1>
              <p className="text-sm text-muted-foreground">{t("setup.headerSubtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <Globe className="hidden size-4 text-muted-foreground sm:inline" />
              <select
                aria-label={t("common.language")}
                value={currentLang}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                {SUPPORTED_LANGUAGES.map((lng) => (
                  <option key={lng} value={lng}>
                    {t(`languages.${lng}`)}
                  </option>
                ))}
              </select>
            </div>
            <ThemeToggle />
            <Badge variant="outline" className="shrink-0">
              {t("setup.stepBadge", { current: step + 1, total: stepTitles.length })}
            </Badge>
          </div>
        </header>

        <div className="mb-6 space-y-2 sm:mb-8">
          <Progress value={progress} />
          <div className="hidden justify-between text-xs text-muted-foreground sm:flex">
            {stepTitles.map((title, i) => (
              <span
                key={title}
                className={cn(i <= step && "font-medium text-foreground")}
              >
                {title}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground sm:hidden">
            <span className="font-medium text-foreground">{stepTitles[step]}</span>
            {step < stepTitles.length - 1 && (
              <> &middot; {t("common.continue").toLowerCase()}: {stepTitles[step + 1]}</>
            )}
          </p>
        </div>

        <Card>
          {step === 0 && <Welcome onNext={next} />}
          {step === 1 && (
            <PrinterStep form={form} update={update} onNext={next} onBack={prev} />
          )}
          {step === 2 && (
            <AuthStep form={form} update={update} onNext={next} onBack={prev} />
          )}
          {step === 3 && (
            <VerifyStep form={form} onNext={next} onBack={prev} />
          )}
          {step === 4 && <DoneStep form={form} onFinish={finish} onBack={prev} />}
        </Card>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const items = [
    t("setup.welcomeItem1"),
    t("setup.welcomeItem2"),
    t("setup.welcomeItem3"),
    t("setup.welcomeItem4"),
  ];
  return (
    <>
      <CardHeader>
        <CardTitle>{t("setup.welcomeTitle")}</CardTitle>
        <CardDescription>{t("setup.welcomeDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          {items.map((line, idx) => (
            <li key={line} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {idx + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onNext}>
          {t("setup.getStarted")} <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardFooter>
    </>
  );
}

function PrinterStep({
  form,
  update,
  onNext,
  onBack,
}: {
  form: Form;
  update: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<PrinterCandidate[] | null>(null);
  const valid = form.printer_host.trim() && form.printer_port > 0;

  async function scan() {
    setScanning(true);
    try {
      const result = await endpoints.discoverPrinters();
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        toast.warning(t("setup.noPrintersFound"));
      } else {
        toast.success(t("setup.candidatesFound", { n: result.candidates.length }));
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("setup.scanFailed"));
    } finally {
      setScanning(false);
    }
  }

  function pick(c: PrinterCandidate) {
    update("printer_host", c.host);
    update("printer_port", c.port);
    toast.success(t("setup.selected", { host: c.host, port: c.port }));
  }

  return (
    <>
      <CardHeader>
        <CardTitle>{t("setup.printerTitle")}</CardTitle>
        <CardDescription>{t("setup.printerDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{t("setup.autoDiscoverTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("setup.autoDiscoverDesc")}</p>
            </div>
            <Button
              variant="outline"
              onClick={scan}
              disabled={scanning}
              className="w-full shrink-0 sm:w-auto"
            >
              {scanning ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Radar className="mr-2 size-4" />
              )}
              {t("setup.scanNetwork")}
            </Button>
          </div>
          {candidates && candidates.length > 0 && (
            <ul className="mt-3 space-y-2">
              {candidates.map((c) => (
                <li
                  key={`${c.host}:${c.port}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-2"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-mono text-sm">
                      {c.host}:{c.port}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {c.name && <span className="truncate">{c.name}</span>}
                      <Badge variant="outline" className="text-[10px]">
                        {c.method}
                      </Badge>
                      {c.reachable ? (
                        <Badge variant="success" className="text-[10px]">
                          <Wifi className="mr-1 size-2.5" /> {t("setup.reachable")}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          <WifiOff className="mr-1 size-2.5" /> {t("setup.unreachable")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => pick(c)}>
                    {t("setup.use")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr,1fr]">
          <div className="space-y-2">
            <Label htmlFor="host">{t("settings.host")}</Label>
            <div className="flex gap-2">
              <Input
                id="host"
                placeholder="192.168.30.40"
                value={form.printer_host}
                onChange={(e) => update("printer_host", e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => openPrinterWebUI(form.printer_host)}
                disabled={!form.printer_host.trim()}
                title={t("setup.openPrinterWebUI")}
                className="shrink-0"
              >
                <ExternalLink className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("setup.openPrinterWebUIHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">{t("settings.port")}</Label>
            <Input
              id="port"
              type="number"
              min={1}
              max={65535}
              value={form.printer_port}
              onChange={(e) => update("printer_port", Number(e.target.value))}
            />
          </div>
        </div>
        <Separator />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="codepage">{t("settings.codepage")}</Label>
            <Input
              id="codepage"
              value={form.printer_codepage}
              onChange={(e) => update("printer_codepage", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("setup.codepageHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeout">{t("settings.timeout")}</Label>
            <Input
              id="timeout"
              type="number"
              min={1}
              value={form.printer_timeout}
              onChange={(e) => update("printer_timeout", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retries">{t("settings.retries")}</Label>
            <Input
              id="retries"
              type="number"
              min={1}
              max={10}
              value={form.printer_retries}
              onChange={(e) => update("printer_retries", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tz">{t("settings.timezone")}</Label>
          <Input
            id="tz"
            value={form.tz}
            onChange={(e) => update("tz", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("setup.tzHint")}</p>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> {t("common.back")}
        </Button>
        <Button onClick={onNext} disabled={!valid}>
          {t("common.continue")} <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardFooter>
    </>
  );
}

function AuthStep({
  form,
  update,
  onNext,
  onBack,
}: {
  form: Form;
  update: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [generating, setGenerating] = useState(false);

  async function gen() {
    setGenerating(true);
    try {
      const { token } = await endpoints.generateToken();
      update("printer_token", token);
      toast.success(t("setup.tokenGenerated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("setup.tokenGenFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(form.printer_token);
      toast.success(t("setup.copyClip"));
    } catch {
      toast.error(t("setup.copyFailed"));
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email.trim());
  const passwordOk =
    form.admin_password.length >= 8 &&
    form.admin_password === form.admin_password_confirm;
  const tokenOk = form.printer_token.length >= 24;
  const valid = emailOk && passwordOk && tokenOk;

  return (
    <>
      <CardHeader>
        <CardTitle>{t("setup.authTitle")}</CardTitle>
        <CardDescription>{t("setup.authDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <KeyRound className="size-4" />
          <AlertTitle>{t("setup.authAlertTitle")}</AlertTitle>
          <AlertDescription>{t("setup.authAlertDesc")}</AlertDescription>
        </Alert>
        <div className="space-y-2">
          <Label htmlFor="admin_email">{t("setup.adminEmail")}</Label>
          <Input
            id="admin_email"
            type="email"
            autoComplete="email"
            placeholder={t("setup.adminEmailPlaceholder")}
            value={form.admin_email}
            onChange={(e) => update("admin_email", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin_name">{t("setup.adminName")}</Label>
          <Input
            id="admin_name"
            type="text"
            placeholder={t("setup.adminNamePlaceholder")}
            value={form.admin_name}
            onChange={(e) => update("admin_name", e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="admin_password">{t("setup.adminPassword")}</Label>
            <Input
              id="admin_password"
              type="password"
              autoComplete="new-password"
              value={form.admin_password}
              onChange={(e) => update("admin_password", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin_password_confirm">{t("setup.adminPasswordConfirm")}</Label>
            <Input
              id="admin_password_confirm"
              type="password"
              autoComplete="new-password"
              value={form.admin_password_confirm}
              onChange={(e) =>
                update("admin_password_confirm", e.target.value)
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("setup.passwordHint")}</p>
        <div className="space-y-2">
          <Label htmlFor="token">{t("setup.webhookToken")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="token"
              type="text"
              placeholder={t("login.tokenPlaceholder")}
              value={form.printer_token}
              onChange={(e) => update("printer_token", e.target.value)}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={copy}
              disabled={!form.printer_token}
              title={t("common.copy")}
              className="shrink-0"
            >
              <ClipboardCopy className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={gen}
              disabled={generating}
              className="shrink-0"
            >
              {generating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              {t("setup.generate")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("setup.tokenHint")}</p>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> {t("common.back")}
        </Button>
        <Button onClick={onNext} disabled={!valid}>
          {t("common.continue")} <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardFooter>
    </>
  );
}

function VerifyStep({
  form,
  onNext,
  onBack,
}: {
  form: Form;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  // The probe is one cohesive state machine: "checking" while in flight, then a
  // reachable flag. `undefined` reachable means the probe hasn't resolved yet.
  // Grouping avoids both initializing and cascading separate state values.
  const [probe, setProbe] = useState<{
    checking: boolean;
    reachable: boolean | null;
  }>({ checking: true, reachable: null });
  const { reachable, checking } = probe;

  async function check() {
    setProbe({ checking: true, reachable: null });
    try {
      const result = await endpoints.testConnection(
        form.printer_host,
        form.printer_port
      );
      setProbe({ checking: false, reachable: result.reachable });
      if (result.reachable) toast.success(t("setup.printerReachable"));
      else toast.warning(t("setup.printerUnreachableMsg"));
    } catch (err) {
      setProbe({ checking: false, reachable: false });
      toast.error(err instanceof ApiError ? err.message : t("setup.checkFailed"));
    }
  }

  // Run the initial probe once on mount. Re-probing is driven by the retry
  // button (`onClick={check}`), not by an effect keyed on form state.
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    void checkRef.current();
  }, []);

  return (
    <>
      <CardHeader>
        <CardTitle>{t("setup.verifyTitle")}</CardTitle>
        <CardDescription>{t("setup.verifyDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="break-all text-sm font-medium">
                {form.printer_host}:{form.printer_port}
              </p>
              <p className="text-xs text-muted-foreground">{t("setup.tcpProbeHint")}</p>
            </div>
            <div className="shrink-0">
              {checking ? (
                <Badge variant="outline">
                  <Loader2 className="mr-1 size-3 animate-spin" /> {t("setup.checking")}
                </Badge>
              ) : reachable === null ? (
                <Badge variant="outline">{t("setup.pending")}</Badge>
              ) : reachable ? (
                <Badge variant="success">
                  <Wifi className="mr-1 size-3" /> {t("setup.reachable")}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <WifiOff className="mr-1 size-3" /> {t("setup.unreachable")}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {reachable === false && (
          <Alert variant="warning">
            <AlertTitle>{t("setup.cannotReachTitle")}</AlertTitle>
            <AlertDescription>{t("setup.cannotReachDesc")}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={check} disabled={checking}>
            {checking ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <TestTube2 className="mr-2 size-4" />
            )}
            {t("setup.rerunProbe")}
          </Button>
          <Button
            variant="outline"
            onClick={() => openPrinterWebUI(form.printer_host)}
            disabled={!form.printer_host.trim()}
          >
            <ExternalLink className="mr-2 size-4" />
            {t("setup.openPrinterWebUI")}
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> {t("common.back")}
        </Button>
        <Button onClick={onNext}>
          {t("common.continue")} <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardFooter>
    </>
  );
}

function DoneStep({
  form,
  onFinish,
  onBack,
}: {
  form: Form;
  onFinish: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10">
          <PartyPopper className="size-6 text-success" />
        </div>
        <CardTitle>{t("setup.doneTitle")}</CardTitle>
        <CardDescription>{t("setup.doneDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <Row label={t("setup.summaryAdmin")} value={form.admin_email} />
          <Row label={t("setup.summaryPrinter")} value={`${form.printer_host}:${form.printer_port}`} />
          <Row label={t("setup.summaryCodepage")} value={form.printer_codepage} />
          <Row label={t("setup.summaryTimeoutRetries")} value={`${form.printer_timeout}s / ${form.printer_retries}`} />
          <Row label={t("setup.summaryTimezone")} value={form.tz} />
          <Row
            label={t("setup.summaryWebhookToken")}
            value={
              form.printer_token.slice(0, 4) +
              "…" +
              form.printer_token.slice(-4) +
              ` (${t("setup.summaryTokenChars", { n: form.printer_token.length })})`
            }
          />
        </dl>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> {t("common.back")}
        </Button>
        <Button onClick={onFinish}>
          <CheckCircle2 className="mr-2 size-4" />
          {t("setup.saveOpen")}
        </Button>
      </CardFooter>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-right">{value}</dd>
    </div>
  );
}
