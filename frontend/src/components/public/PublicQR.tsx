import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Loader2, QrCode, Send, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, endpoints } from "@/lib/api";
import { usePublicUsername } from "@/lib/publicUser";

const QR_PIXEL_SIZE = 384;

type WifiAuth = "WPA" | "WEP" | "nopass";

function escapeWifi(value: string): string {
  return value.replace(/([\\;,":])/g, "\\$1");
}

function buildWifiPayload(
  ssid: string,
  password: string,
  auth: WifiAuth,
  hidden: boolean
): string {
  const t = auth === "nopass" ? "" : auth;
  const p = auth === "nopass" ? "" : escapeWifi(password);
  return `WIFI:T:${t};S:${escapeWifi(ssid)};P:${p};H:${hidden ? "true" : "false"};;`;
}

async function renderQr(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: QR_PIXEL_SIZE,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function QrPreview({ dataUrl }: { dataUrl: string | null }) {
  const { t } = useTranslation();
  if (!dataUrl) {
    return (
      <div className="flex aspect-square w-full max-w-[200px] items-center justify-center rounded-md border border-dashed bg-muted/30 text-xs text-muted-foreground">
        {t("public.qr.previewEmpty")}
      </div>
    );
  }
  return (
    <img
      src={dataUrl}
      alt="QR preview"
      className="aspect-square w-full max-w-[200px] rounded-md border bg-white"
    />
  );
}

function UrlForm() {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const value = text.trim();
    if (!value) {
      setPreview(null);
      return;
    }
    const token = ++generation.current;
    renderQr(value)
      .then((url) => {
        if (token === generation.current) setPreview(url);
      })
      .catch(() => {
        if (token === generation.current) setPreview(null);
      });
  }, [text]);

  async function run() {
    if (!preview) return;
    if (!username.trim()) {
      toast.error(t("public.usernameRequired"));
      return;
    }
    setBusy(true);
    try {
      await endpoints.printImage({ image: preview, align: "center", username });
      toast.success(t("public.qr.printed"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("public.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="qr-url">{t("public.qr.urlLabel")}</Label>
        <Input
          id="qr-url"
          placeholder={t("public.qr.urlPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="flex justify-center sm:justify-end">
        <QrPreview dataUrl={preview} />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={run} disabled={busy || !preview}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {t("public.qr.print")}
        </Button>
      </div>
    </div>
  );
}

function WifiForm() {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<WifiAuth>("WPA");
  const [hidden, setHidden] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!ssid.trim()) {
      setPreview(null);
      return;
    }
    const payload = buildWifiPayload(ssid.trim(), password, auth, hidden);
    const token = ++generation.current;
    renderQr(payload)
      .then((url) => {
        if (token === generation.current) setPreview(url);
      })
      .catch(() => {
        if (token === generation.current) setPreview(null);
      });
  }, [ssid, password, auth, hidden]);

  async function run() {
    if (!preview) return;
    if (!username.trim()) {
      toast.error(t("public.usernameRequired"));
      return;
    }
    setBusy(true);
    try {
      await endpoints.printImage({ image: preview, align: "center", username });
      toast.success(t("public.qr.printed"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("public.failed"));
    } finally {
      setBusy(false);
    }
  }

  const authLabels: Record<WifiAuth, string> = {
    WPA: t("public.qr.authWpa"),
    WEP: t("public.qr.authWep"),
    nopass: t("public.qr.authOpen"),
  };

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wifi-ssid">{t("public.qr.wifiSsid")}</Label>
          <Input
            id="wifi-ssid"
            placeholder={t("public.qr.wifiSsidPlaceholder")}
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wifi-password">{t("public.qr.wifiPassword")}</Label>
          <Input
            id="wifi-password"
            type="password"
            placeholder={t("public.qr.wifiPasswordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={auth === "nopass"}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("public.qr.wifiAuth")}</Label>
          <div className="flex flex-wrap gap-2">
            {(["WPA", "WEP", "nopass"] as const).map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={auth === a ? "default" : "outline"}
                onClick={() => setAuth(a)}
              >
                {authLabels[a]}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="wifi-hidden"
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="h-4 w-4 rounded border"
          />
          <Label htmlFor="wifi-hidden" className="cursor-pointer">
            {t("public.qr.wifiHidden")}
          </Label>
        </div>
      </div>
      <div className="flex justify-center sm:justify-end">
        <QrPreview dataUrl={preview} />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={run} disabled={busy || !preview}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {t("public.qr.print")}
        </Button>
      </div>
    </div>
  );
}

export function PublicQR() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("public.qr.intro")}</p>
      <Tabs defaultValue="url">
        <TabsList>
          <TabsTrigger value="url">
            <QrCode className="mr-2 h-4 w-4" />
            {t("public.qr.tabUrl")}
          </TabsTrigger>
          <TabsTrigger value="wifi">
            <Wifi className="mr-2 h-4 w-4" />
            {t("public.qr.tabWifi")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="url" className="mt-4">
          <UrlForm />
        </TabsContent>
        <TabsContent value="wifi" className="mt-4">
          <WifiForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
