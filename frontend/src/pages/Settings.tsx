import { FormEvent, useEffect, useState } from "react";
import {
  ClipboardCopy,
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
import { ApiError, ConfigResponse, endpoints, setToken } from "@/lib/api";

export function Settings() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [form, setForm] = useState<Partial<ConfigResponse>>({});
  const [token, setNewToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    endpoints
      .config()
      .then((c) => {
        setConfig(c);
        setForm(c);
      })
      .catch(() => toast.error("Could not load configuration"));
  }, []);

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
      toast.success("Configuration saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    try {
      const { token } = await endpoints.generateToken();
      setNewToken(token);
      toast.success("New token generated — save below to apply");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function applyToken() {
    if (token.length < 24) {
      toast.error("Token must be at least 24 characters");
      return;
    }
    setBusy(true);
    try {
      const result = await endpoints.updateConfig({ printer_token: token });
      setConfig(result.config);
      setToken(token);
      setNewToken("");
      toast.success("Token rotated — using new credentials");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
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
        result.reachable ? "Printer is reachable" : "Printer is unreachable"
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setTesting(false);
    }
  }

  if (!config) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Live configuration — persisted to /app/data/config.json. Takes effect
          on the next print job, no restart required.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Printer</CardTitle>
          <CardDescription>
            Network address and ESC/POS connection tuning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr,1fr]">
              <div className="space-y-2">
                <Label htmlFor="host">Printer host</Label>
                <Input
                  id="host"
                  value={form.printer_host ?? ""}
                  onChange={(e) => setForm({ ...form, printer_host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
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
                <Label htmlFor="codepage">Codepage</Label>
                <Input
                  id="codepage"
                  value={form.printer_codepage ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, printer_codepage: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (s)</Label>
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
                <Label htmlFor="retries">Retries</Label>
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
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                value={form.tz ?? ""}
                onChange={(e) => setForm({ ...form, tz: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube2 className="mr-2 h-4 w-4" />
                )}
                Test connection
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bearer token</CardTitle>
          <CardDescription>
            Rotate the secret used by callers. The dashboard credential is
            updated automatically on rotation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Current: </span>
              <span className="font-mono">{config.token_preview || "—"}</span>
            </div>
            <Badge variant={config.token_set ? "success" : "destructive"}>
              {config.token_set ? "configured" : "missing"}
            </Badge>
          </div>
          {token && (
            <Alert>
              <AlertTitle>New token generated</AlertTitle>
              <AlertDescription className="font-mono text-xs break-all">
                {token}
              </AlertDescription>
            </Alert>
          )}
          <Separator />
          <div className="flex gap-2">
            <Button variant="outline" onClick={rotate} disabled={busy}>
              <RefreshCw className="mr-2 h-4 w-4" /> Generate new token
            </Button>
            {token && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(token);
                    toast.success("Copied");
                  }}
                >
                  <ClipboardCopy className="mr-2 h-4 w-4" /> Copy
                </Button>
                <Button onClick={applyToken} disabled={busy}>
                  Apply token
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
