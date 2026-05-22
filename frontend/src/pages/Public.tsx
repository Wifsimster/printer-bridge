import { PointerEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eraser, Loader2, Printer, Send, ShieldCheck } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, endpoints } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AppFooter } from "@/components/AppFooter";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;

export function Public() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { me } = useAuth();
  const signedIn = Boolean(me);

  return (
    <div className="app-shell-bg flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info text-primary-foreground shadow-soft">
            <Printer className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">printcast</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button
            variant={signedIn ? "default" : "outline"}
            size="sm"
            onClick={() => navigate(signedIn ? "/admin" : "/login")}
            className={signedIn ? "shadow-soft" : ""}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {signedIn ? t("public.adminConsole") : t("public.adminLogin")}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 animate-fade-in space-y-6 p-4 md:p-8">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">{t("public.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("public.description")}</p>
        </div>

        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle>{t("public.composeTitle")}</CardTitle>
            <CardDescription>{t("public.composeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="text">
              <TabsList>
                <TabsTrigger value="text">{t("public.tabText")}</TabsTrigger>
                <TabsTrigger value="draw">{t("public.tabDraw")}</TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="mt-6">
                <PublicText />
              </TabsContent>
              <TabsContent value="draw" className="mt-6">
                <PublicDraw />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}

function PublicText() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [bold, setBold] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await endpoints.printText({ text, align, bold });
      toast.success(t("public.textPrinted"));
      setText("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("public.failed"));
    } finally {
      setBusy(false);
    }
  }

  const alignLabels: Record<"left" | "center" | "right", string> = {
    left: t("public.alignLeft"),
    center: t("public.alignCenter"),
    right: t("public.alignRight"),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="public-text">{t("public.yourMessage")}</Label>
        <Textarea
          id="public-text"
          rows={6}
          placeholder={t("public.messagePlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("public.alignment")}</Label>
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
          <Label>{t("public.style")}</Label>
          <Button
            size="sm"
            variant={bold ? "default" : "outline"}
            onClick={() => setBold((b) => !b)}
            type="button"
          >
            {bold ? t("public.boldOn") : t("public.boldOff")}
          </Button>
        </div>
      </div>
      <Button onClick={run} disabled={busy || !text.trim()}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {t("public.print")}
      </Button>
    </div>
  );
}

function PublicDraw() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pointerPos(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointerPos(e);
  }

  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointerPos(e);
    if (!ctx || !lastPoint.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    if (!dirty.current) {
      dirty.current = true;
      setHasInk(true);
    }
  }

  function onUp(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    lastPoint.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setHasInk(false);
  }

  async function run() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    setBusy(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await endpoints.printImage({ image: dataUrl, align: "center" });
      toast.success(t("public.drawingPrinted"));
      clear();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("public.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("public.drawDesc")}</p>
      <div className="overflow-hidden rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full touch-none"
          style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={run} disabled={busy || !hasInk}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {t("public.printDrawing")}
        </Button>
        <Button variant="outline" onClick={clear} disabled={busy}>
          <Eraser className="mr-2 h-4 w-4" /> {t("public.clear")}
        </Button>
      </div>
    </div>
  );
}
