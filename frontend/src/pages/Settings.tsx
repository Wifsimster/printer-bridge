import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardCopy,
  Globe,
  Loader2,
  RefreshCw,
  Save,
  TestTube2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ApiError, ConfigResponse, endpoints } from "@/lib/api";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export function Settings() {
  const { t, i18n } = useTranslation();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [form, setForm] = useState<Partial<ConfigResponse>>({});
  const [token, setNewToken] = useState("");
  // Async status flags grouped so related updates stay together.
  const [status, setStatus] = useState({ busy: false, testing: false });
  const { busy, testing } = status;
  const setBusy = (busy: boolean) => setStatus((s) => ({ ...s, busy }));
  const setTesting = (testing: boolean) =>
    setStatus((s) => ({ ...s, testing }));

  useEffect(() => {
    endpoints
      .config()
      .then((c) => {
        setConfig(c);
        setForm(c);
      })
      .catch(() => toast.error(t("settings.loadConfigFailed")));
  }, [t]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      delete payload["setup_completed"];
      delete payload["token_set"];
      delete payload["token_preview"];
      const result = await endpoints.updateConfig(payload);
      setConfig(result.config);
      setForm(result.config);
      toast.success(t("settings.configSaved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("settings.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    try {
      const { token } = await endpoints.generateToken();
      setNewToken(token);
      toast.success(t("settings.newTokenGenerated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("settings.failed"));
    }
  }

  async function applyToken() {
    if (token.length < 24) {
      toast.error(t("settings.tokenMinLength"));
      return;
    }
    setBusy(true);
    try {
      const result = await endpoints.updateConfig({ printer_token: token });
      setConfig(result.config);
      setNewToken("");
      toast.success(t("settings.tokenRotated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("settings.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!form.printer_host || !form.printer_port) return;
    setTesting(true);
    try {
      const result = await endpoints.testConnection(
        form.printer_host as string,
        Number(form.printer_port)
      );
      toast[result.reachable ? "success" : "warning"](
        result.reachable ? t("settings.printerReachable") : t("settings.printerUnreachable")
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("settings.failed"));
    } finally {
      setTesting(false);
    }
  }

  if (!config) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.printerCardTitle")}</CardTitle>
          <CardDescription>{t("settings.printerCardDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr,1fr]">
              <div className="space-y-2">
                <Label htmlFor="host">{t("settings.host")}</Label>
                <Input
                  id="host"
                  value={form.printer_host ?? ""}
                  onChange={(e) => setForm({ ...form, printer_host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">{t("settings.port")}</Label>
                <Input
                  id="port"
                  type="number"
                  value={form.printer_port ?? 9100}
                  onChange={(e) =>
                    setForm({ ...form, printer_port: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="codepage">{t("settings.codepage")}</Label>
                <Input
                  id="codepage"
                  value={form.printer_codepage ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, printer_codepage: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">{t("settings.timeout")}</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={form.printer_timeout ?? 20}
                  onChange={(e) =>
                    setForm({ ...form, printer_timeout: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retries">{t("settings.retries")}</Label>
                <Input
                  id="retries"
                  type="number"
                  value={form.printer_retries ?? 3}
                  onChange={(e) =>
                    setForm({ ...form, printer_retries: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">{t("settings.timezone")}</Label>
              <Input
                id="tz"
                value={form.tz ?? ""}
                onChange={(e) => setForm({ ...form, tz: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                {t("common.save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={testing}
                className="w-full sm:w-auto"
              >
                {testing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <TestTube2 className="mr-2 size-4" />
                )}
                {t("settings.testConnection")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-4" />
            {t("settings.languageCardTitle")}
          </CardTitle>
          <CardDescription>{t("settings.languageCardDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label htmlFor="lang" className="sr-only">
              {t("common.language")}
            </Label>
            <select
              id="lang"
              value={currentLang}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng}>
                  {t(`languages.${lng}`)}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.tokenCardTitle")}</CardTitle>
          <CardDescription>{t("settings.tokenCardDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
            <div className="min-w-0 text-sm">
              <span className="text-muted-foreground">{t("settings.current")}</span>
              <span className="font-mono break-all">{config.token_preview || t("common.dash")}</span>
            </div>
            <Badge variant={config.token_set ? "success" : "destructive"} className="shrink-0">
              {config.token_set ? t("settings.configured") : t("settings.missing")}
            </Badge>
          </div>
          {token && (
            <Alert>
              <AlertTitle>{t("settings.newTokenTitle")}</AlertTitle>
              <AlertDescription className="font-mono text-xs break-all">
                {token}
              </AlertDescription>
            </Alert>
          )}
          <Separator />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              onClick={rotate}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="mr-2 size-4" /> {t("settings.generateNew")}
            </Button>
            {token && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(token);
                    toast.success(t("common.copied"));
                  }}
                  className="w-full sm:w-auto"
                >
                  <ClipboardCopy className="mr-2 size-4" /> {t("common.copy")}
                </Button>
                <Button
                  onClick={applyToken}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  {t("settings.applyToken")}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
