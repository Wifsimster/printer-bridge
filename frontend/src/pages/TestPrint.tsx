import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Network, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ApiError, endpoints } from "@/lib/api";

export function TestPrint() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("testPrint.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("testPrint.description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("testPrint.composerTitle")}</CardTitle>
          <CardDescription>{t("testPrint.composerDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="selftest">
            <TabsList>
              <TabsTrigger value="selftest">{t("testPrint.tabSelfTest")}</TabsTrigger>
              <TabsTrigger value="quick">{t("testPrint.tabQuick")}</TabsTrigger>
              <TabsTrigger value="text">{t("testPrint.tabText")}</TabsTrigger>
              <TabsTrigger value="receipt">{t("testPrint.tabReceipt")}</TabsTrigger>
            </TabsList>
            <TabsContent value="selftest" className="mt-6">
              <SelfTest />
            </TabsContent>
            <TabsContent value="quick" className="mt-6">
              <QuickTest />
            </TabsContent>
            <TabsContent value="text" className="mt-6">
              <TextPrint />
            </TabsContent>
            <TabsContent value="receipt" className="mt-6">
              <ReceiptPrint />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function SelfTest() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await endpoints.printSelfTest();
      toast.success(t("testPrint.selfTestSent"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("testPrint.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("testPrint.selfTestDesc")}</p>
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Network className="mr-2 h-4 w-4" />
        )}
        {t("testPrint.runSelfTest")}
      </Button>
    </div>
  );
}

function QuickTest() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await endpoints.printTest();
      toast.success(t("testPrint.testSent"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("testPrint.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("testPrint.quickDesc")}</p>
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Printer className="mr-2 h-4 w-4" />
        )}
        {t("testPrint.runTestPrint")}
      </Button>
    </div>
  );
}

function TextPrint() {
  const { t } = useTranslation();
  const [text, setText] = useState("Bonjour depuis printcast ☕");
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [bold, setBold] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await endpoints.printText({ text, align, bold });
      toast.success(t("testPrint.textPrinted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("testPrint.failed"));
    } finally {
      setBusy(false);
    }
  }

  const alignLabels: Record<"left" | "center" | "right", string> = {
    left: t("testPrint.alignLeft"),
    center: t("testPrint.alignCenter"),
    right: t("testPrint.alignRight"),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="text">{t("testPrint.textBody")}</Label>
        <Textarea
          id="text"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("testPrint.alignment")}</Label>
          <div className="flex gap-2">
            {(["left", "center", "right"] as const).map((a) => (
              <Button
                key={a}
                size="sm"
                variant={align === a ? "default" : "outline"}
                onClick={() => setAlign(a)}
                type="button"
              >
                {alignLabels[a]}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("testPrint.style")}</Label>
          <Button
            size="sm"
            variant={bold ? "default" : "outline"}
            onClick={() => setBold((b) => !b)}
            type="button"
          >
            {bold ? t("testPrint.boldOn") : t("testPrint.boldOff")}
          </Button>
        </div>
      </div>
      <Button onClick={run} disabled={busy || !text.trim()}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {t("testPrint.print")}
      </Button>
    </div>
  );
}

function ReceiptPrint() {
  const { t } = useTranslation();
  const [title, setTitle] = useState("COURSES");
  const [subtitle, setSubtitle] = useState("");
  const [lines, setLines] = useState("- Pain\n- Café\n- Œufs x6");
  const [footer, setFooter] = useState("Bon appétit !");
  const [qr, setQr] = useState("");
  const [timestamp, setTimestamp] = useState(true);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await endpoints.printReceipt({
        title: title || undefined,
        subtitle: subtitle || undefined,
        lines: lines.split("\n").filter(Boolean),
        footer: footer || undefined,
        qr: qr || undefined,
        timestamp,
      });
      toast.success(t("testPrint.receiptPrinted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("testPrint.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">{t("testPrint.receiptTitle")}</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitle">{t("testPrint.receiptSubtitle")}</Label>
          <Input
            id="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lines">{t("testPrint.receiptLines")}</Label>
        <Textarea
          id="lines"
          rows={6}
          value={lines}
          onChange={(e) => setLines(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="footer">{t("testPrint.receiptFooter")}</Label>
          <Input id="footer" value={footer} onChange={(e) => setFooter(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr">{t("testPrint.receiptQr")}</Label>
          <Input id="qr" value={qr} onChange={(e) => setQr(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="ts"
          type="checkbox"
          checked={timestamp}
          onChange={(e) => setTimestamp(e.target.checked)}
        />
        <Label htmlFor="ts">{t("testPrint.receiptTimestamp")}</Label>
      </div>
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {t("testPrint.receiptPrint")}
      </Button>
    </div>
  );
}
