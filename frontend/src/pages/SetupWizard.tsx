import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
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
import { ApiError, endpoints, setToken, type PrinterCandidate } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = 0 | 1 | 2 | 3 | 4;

interface Form {
  printer_host: string;
  printer_port: number;
  printer_codepage: string;
  printer_timeout: number;
  printer_retries: number;
  tz: string;
  printer_token: string;
}

const initialForm: Form = {
  printer_host: "",
  printer_port: 9100,
  printer_codepage: "CP858",
  printer_timeout: 20,
  printer_retries: 3,
  tz: "Europe/Paris",
  printer_token: "",
};

const stepTitles = [
  "Welcome",
  "Printer",
  "Authentication",
  "Verify",
  "Done",
];

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<Form>(initialForm);
  const navigate = useNavigate();

  const progress = useMemo(() => ((step + 1) / stepTitles.length) * 100, [step]);

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
      await endpoints.completeSetup({ ...form });
      setToken(form.printer_token);
      toast.success("Setup complete");
      onComplete();
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Setup failed";
      toast.error(msg);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Printer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">printcast setup</h1>
              <p className="text-sm text-muted-foreground">
                First-run configuration wizard
              </p>
            </div>
          </div>
          <Badge variant="outline">
            Step {step + 1} of {stepTitles.length}
          </Badge>
        </header>

        <div className="mb-8 space-y-2">
          <Progress value={progress} />
          <div className="flex justify-between text-xs text-muted-foreground">
            {stepTitles.map((t, i) => (
              <span
                key={t}
                className={cn(i <= step && "font-medium text-foreground")}
              >
                {t}
              </span>
            ))}
          </div>
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
  return (
    <>
      <CardHeader>
        <CardTitle>Welcome to printcast</CardTitle>
        <CardDescription>
          Bridge HTTP requests to an ESC/POS thermal printer over the network.
          This wizard takes about a minute and configures the printer host, an
          authentication token, and a verification print.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          {[
            "Point the service at your printer's IP and raw-TCP port.",
            "Generate or paste a bearer token for the /print endpoints.",
            "Run a connectivity check and an optional test print.",
            "Land on the supervision dashboard.",
          ].map((line, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {idx + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onNext}>
          Get started <ArrowRight className="ml-2 h-4 w-4" />
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
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<PrinterCandidate[] | null>(null);
  const valid = form.printer_host.trim() && form.printer_port > 0;

  async function scan() {
    setScanning(true);
    try {
      const result = await endpoints.discoverPrinters();
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        toast.warning("No printers found on the local network");
      } else {
        toast.success(`Found ${result.candidates.length} candidate(s)`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function pick(c: PrinterCandidate) {
    update("printer_host", c.host);
    update("printer_port", c.port);
    toast.success(`Selected ${c.host}:${c.port}`);
  }

  return (
    <>
      <CardHeader>
        <CardTitle>Printer connection</CardTitle>
        <CardDescription>
          Address of your network thermal printer. Default is raw TCP / JetDirect
          on port 9100.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Auto-discover on LAN</p>
              <p className="text-xs text-muted-foreground">
                mDNS browse + parallel TCP probe of the local /24 on port 9100.
              </p>
            </div>
            <Button variant="outline" onClick={scan} disabled={scanning}>
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Radar className="mr-2 h-4 w-4" />
              )}
              Scan network
            </Button>
          </div>
          {candidates && candidates.length > 0 && (
            <ul className="mt-3 space-y-2">
              {candidates.map((c) => (
                <li
                  key={`${c.host}:${c.port}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background p-2"
                >
                  <div className="min-w-0 space-y-0.5">
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
                          <Wifi className="mr-1 h-2.5 w-2.5" /> reachable
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          <WifiOff className="mr-1 h-2.5 w-2.5" /> unreachable
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => pick(c)}>
                    Use
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr,1fr]">
          <div className="space-y-2">
            <Label htmlFor="host">Printer host</Label>
            <Input
              id="host"
              placeholder="192.168.30.40"
              value={form.printer_host}
              onChange={(e) => update("printer_host", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
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
            <Label htmlFor="codepage">Codepage</Label>
            <Input
              id="codepage"
              value={form.printer_codepage}
              onChange={(e) => update("printer_codepage", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              CP858 supports French accents.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeout">Timeout (s)</Label>
            <Input
              id="timeout"
              type="number"
              min={1}
              value={form.printer_timeout}
              onChange={(e) => update("printer_timeout", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retries">Retries</Label>
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
          <Label htmlFor="tz">Timezone</Label>
          <Input
            id="tz"
            value={form.tz}
            onChange={(e) => update("tz", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            IANA name (e.g. Europe/Paris). Used for receipt timestamps.
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!valid}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
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
  const [generating, setGenerating] = useState(false);

  async function gen() {
    setGenerating(true);
    try {
      const { token } = await endpoints.generateToken();
      update("printer_token", token);
      toast.success("Token generated — copy it somewhere safe");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(form.printer_token);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  }

  const tokenOk = form.printer_token.length >= 24;

  return (
    <>
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          The /print endpoints require an HTTP bearer token. Generate a fresh
          one or paste an existing secret.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Store this token somewhere safe</AlertTitle>
          <AlertDescription>
            It is the only credential for callers like n8n, Home Assistant, and
            ntfy. You can rotate it later from settings.
          </AlertDescription>
        </Alert>
        <div className="space-y-2">
          <Label htmlFor="token">Bearer token</Label>
          <div className="flex gap-2">
            <Input
              id="token"
              type="text"
              placeholder="hex…"
              value={form.printer_token}
              onChange={(e) => update("printer_token", e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={copy}
              disabled={!form.printer_token}
              title="Copy"
            >
              <ClipboardCopy className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={gen} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use at least 24 characters. A 64-char hex string is recommended.
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!tokenOk}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
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
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const result = await endpoints.testConnection(
        form.printer_host,
        form.printer_port
      );
      setReachable(result.reachable);
      if (result.reachable) toast.success("Printer is reachable");
      else toast.warning("Printer is unreachable — check IP, port, and VLAN");
    } catch (err) {
      setReachable(false);
      toast.error(err instanceof ApiError ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <CardHeader>
        <CardTitle>Verify connectivity</CardTitle>
        <CardDescription>
          TCP-probe the printer before saving the configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {form.printer_host}:{form.printer_port}
              </p>
              <p className="text-xs text-muted-foreground">
                Raw TCP connect probe (timeout 5s)
              </p>
            </div>
            <div>
              {checking ? (
                <Badge variant="outline">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> checking
                </Badge>
              ) : reachable === null ? (
                <Badge variant="outline">pending</Badge>
              ) : reachable ? (
                <Badge variant="success">
                  <Wifi className="mr-1 h-3 w-3" /> reachable
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <WifiOff className="mr-1 h-3 w-3" /> unreachable
                </Badge>
              )}
            </div>
          </div>
        </div>
        {reachable === false && (
          <Alert variant="warning">
            <AlertTitle>Cannot reach the printer</AlertTitle>
            <AlertDescription>
              You can still save and finish setup. The service will keep
              retrying when print requests come in. Check the host/port and any
              firewall or VLAN restrictions on port 9100.
            </AlertDescription>
          </Alert>
        )}
        <Button variant="outline" onClick={check} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <TestTube2 className="mr-2 h-4 w-4" />
          )}
          Re-run probe
        </Button>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
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
  return (
    <>
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
          <PartyPopper className="h-6 w-6 text-success" />
        </div>
        <CardTitle>Ready to print</CardTitle>
        <CardDescription>
          Review the summary, then save the configuration. The service stores
          it in /app/data and applies it immediately — no restart needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <Row label="Printer" value={`${form.printer_host}:${form.printer_port}`} />
          <Row label="Codepage" value={form.printer_codepage} />
          <Row label="Timeout / retries" value={`${form.printer_timeout}s / ${form.printer_retries}`} />
          <Row label="Timezone" value={form.tz} />
          <Row
            label="Token"
            value={
              form.printer_token.slice(0, 4) +
              "…" +
              form.printer_token.slice(-4) +
              ` (${form.printer_token.length} chars)`
            }
          />
        </dl>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onFinish}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Save and open dashboard
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
