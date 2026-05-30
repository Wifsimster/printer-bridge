import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, QrCode, Send, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, endpoints } from "@/lib/api";
import { usePublicUsername } from "@/lib/publicUsername";
import { useQrPreview } from "@/components/public/useQrPreview";

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
  const [busy, setBusy] = useState(false);
  const { preview, update } = useQrPreview();

  function onTextChange(value: string) {
    setText(value);
    update(value);
  }

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
          onChange={(e) => onTextChange(e.target.value)}
        />
      </div>
      <div className="flex justify-center sm:justify-end">
        <QrPreview dataUrl={preview} />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={run} disabled={busy || !preview}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          {t("public.qr.print")}
        </Button>
      </div>
    </div>
  );
}

type WifiFields = {
  ssid: string;
  password: string;
  auth: WifiAuth;
  hidden: boolean;
};

function WifiForm() {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
  const [busy, setBusy] = useState(false);
  // Related Wi-Fi form fields grouped into a single state object.
  const [fields, setFields] = useState<WifiFields>({
    ssid: "",
    password: "",
    auth: "WPA",
    hidden: false,
  });
  const { ssid, password, auth, hidden } = fields;
  const { preview, update } = useQrPreview();

  function patch(next: Partial<WifiFields>) {
    const merged = { ...fields, ...next };
    setFields(merged);
    update(
      merged.ssid.trim()
        ? buildWifiPayload(merged.ssid.trim(), merged.password, merged.auth, merged.hidden)
        : ""
    );
  }

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
            onChange={(e) => patch({ ssid: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wifi-password">{t("public.qr.wifiPassword")}</Label>
          <Input
            id="wifi-password"
            type="password"
            placeholder={t("public.qr.wifiPasswordPlaceholder")}
            value={password}
            onChange={(e) => patch({ password: e.target.value })}
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
                onClick={() => patch({ auth: a })}
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
            onChange={(e) => patch({ hidden: e.target.checked })}
            aria-label={t("public.qr.wifiHidden")}
            className="size-4 rounded border"
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
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
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
            <QrCode className="mr-2 size-4" />
            {t("public.qr.tabUrl")}
          </TabsTrigger>
          <TabsTrigger value="wifi">
            <Wifi className="mr-2 size-4" />
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
