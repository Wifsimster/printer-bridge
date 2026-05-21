import { useState } from "react";
import { Loader2, Printer, Send } from "lucide-react";
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
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Test print</h1>
        <p className="text-sm text-muted-foreground">
          Send a manual print job to validate the bridge or to fire one-off receipts.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Job composer</CardTitle>
          <CardDescription>
            Pick a job type, fill in the fields, and hit print.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="quick">
            <TabsList>
              <TabsTrigger value="quick">Quick test</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="receipt">Receipt</TabsTrigger>
            </TabsList>
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

function QuickTest() {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await endpoints.printTest();
      toast.success("Test print sent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Prints the same canary as the daily cron — accents, QR, and a timestamp.
      </p>
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Printer className="mr-2 h-4 w-4" />
        )}
        Run test print
      </Button>
    </div>
  );
}

function TextPrint() {
  const [text, setText] = useState("Bonjour depuis printcast ☕");
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [bold, setBold] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await endpoints.printText({ text, align, bold });
      toast.success("Text printed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="text">Body</Label>
        <Textarea
          id="text"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Alignment</Label>
          <div className="flex gap-2">
            {(["left", "center", "right"] as const).map((a) => (
              <Button
                key={a}
                size="sm"
                variant={align === a ? "default" : "outline"}
                onClick={() => setAlign(a)}
                type="button"
              >
                {a}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Style</Label>
          <Button
            size="sm"
            variant={bold ? "default" : "outline"}
            onClick={() => setBold((b) => !b)}
            type="button"
          >
            Bold {bold ? "on" : "off"}
          </Button>
        </div>
      </div>
      <Button onClick={run} disabled={busy || !text.trim()}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Print
      </Button>
    </div>
  );
}

function ReceiptPrint() {
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
      toast.success("Receipt printed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input
            id="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lines">Lines (one per row)</Label>
        <Textarea
          id="lines"
          rows={6}
          value={lines}
          onChange={(e) => setLines(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="footer">Footer</Label>
          <Input id="footer" value={footer} onChange={(e) => setFooter(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr">QR payload (optional)</Label>
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
        <Label htmlFor="ts">Print timestamp</Label>
      </div>
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Print receipt
      </Button>
    </div>
  );
}
