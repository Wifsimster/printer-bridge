import { PointerEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Dices, Eraser, Loader2, Pencil, Printer, Send, ShieldCheck, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, endpoints } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PublicUsernameProvider, randomUsername } from "@/lib/publicUser";
import { usePublicUsername, USERNAME_MAX_LENGTH } from "@/lib/publicUsername";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/AppFooter";
import { PublicQR } from "@/components/public/PublicQR";
import { PublicFortune } from "@/components/public/PublicFortune";
import { PublicAscii } from "@/components/public/PublicAscii";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;

export function Public() {
  return (
    <PublicUsernameProvider>
      <PublicShell />
    </PublicUsernameProvider>
  );
}

function PublicShell() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { me } = useAuth();
  const { username } = usePublicUsername();
  const signedIn = Boolean(me);
  // Mandatory name: open the modal on first visit (nothing saved yet).
  const [nameOpen, setNameOpen] = useState(() => !username.trim());

  return (
    <div className="app-shell-bg flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-background/70 px-3 backdrop-blur md:h-16 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info text-primary-foreground shadow-soft">
            <Printer className="size-4" />
          </div>
          <span className="truncate text-base font-semibold tracking-tight">printcast</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <LanguageSwitcher showIcon={false} />
          <ThemeToggle />
          <Button
            variant={signedIn ? "default" : "outline"}
            size="sm"
            onClick={() => navigate(signedIn ? "/admin" : "/login")}
            className={cn("shrink-0", signedIn && "shadow-soft")}
            aria-label={signedIn ? t("public.adminConsole") : t("public.adminLogin")}
          >
            <ShieldCheck className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {signedIn ? t("public.adminConsole") : t("public.adminLogin")}
            </span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 animate-fade-in space-y-5 p-4 md:p-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("public.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("public.description")}</p>
        </div>

        <PrintingAsBar onChange={() => setNameOpen(true)} />

        <Card className="shadow-medium">
          <CardContent className="pt-6">
            <Compose />
          </CardContent>
        </Card>
      </main>

      <AppFooter />

      <UsernameModal open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}

function PrintingAsBar({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
  if (!username.trim()) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
      <span className="truncate text-muted-foreground">
        {t("public.printingAs", { name: username })}
      </span>
      <Button variant="ghost" size="sm" onClick={onChange} className="h-7 shrink-0 px-2">
        <Pencil className="mr-1.5 size-3.5" />
        {t("public.changeName")}
      </Button>
    </div>
  );
}

const MORE_TABS = ["qr", "fortune", "ascii"];

function Compose() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("text");
  const [showMore, setShowMore] = useState(false);
  // Keep the secondary row open whenever one of its tabs is active.
  const secondaryOpen = showMore || MORE_TABS.includes(tab);

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div className="flex flex-wrap items-center gap-1.5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="text">{t("public.tabText")}</TabsTrigger>
          <TabsTrigger value="draw">{t("public.tabDraw")}</TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={secondaryOpen}
          className="h-8"
        >
          {t("public.more")}
          <ChevronDown
            className={cn("ml-1 size-4 transition-transform", secondaryOpen && "rotate-180")}
          />
        </Button>
      </div>
      {secondaryOpen && (
        <TabsList className="mt-2 flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="qr">{t("public.tabQr")}</TabsTrigger>
          <TabsTrigger value="fortune">{t("public.tabFortune")}</TabsTrigger>
          <TabsTrigger value="ascii">{t("public.tabAscii")}</TabsTrigger>
        </TabsList>
      )}
      <TabsContent value="text" className="mt-6">
        <PublicText />
      </TabsContent>
      <TabsContent value="draw" className="mt-6">
        <PublicDraw />
      </TabsContent>
      <TabsContent value="qr" className="mt-6">
        <PublicQR />
      </TabsContent>
      <TabsContent value="fortune" className="mt-6">
        <PublicFortune />
      </TabsContent>
      <TabsContent value="ascii" className="mt-6">
        <PublicAscii />
      </TabsContent>
    </Tabs>
  );
}

function UsernameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { username, setUsername } = usePublicUsername();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Once a name exists the modal is just an editor, so it can be dismissed.
  const dismissable = Boolean(username.trim());

  useEffect(() => {
    if (!open) return;
    // Pre-fill with the current name, or a random suggestion on first visit,
    // so confirming is a single tap.
    setDraft(username.trim() || randomUsername());
    const focusId = window.setTimeout(() => inputRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissable) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusId);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, username, dismissable, onClose]);

  if (!open) return null;

  const trimmed = draft.trim();
  const canConfirm = trimmed.length > 0;

  function confirm() {
    if (!canConfirm) return;
    setUsername(trimmed);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => dismissable && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-modal-title"
        className="relative z-10 w-full max-w-sm animate-fade-in rounded-xl border border-border/60 bg-card p-6 shadow-strong"
      >
        {dismissable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-3 top-3 size-8"
            aria-label={t("public.close")}
          >
            <X className="size-4" />
          </Button>
        )}
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info text-primary-foreground shadow-soft">
            <Printer className="size-4" />
          </div>
          <h2 id="username-modal-title" className="text-lg font-semibold tracking-tight">
            {t("public.nameModalTitle")}
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{t("public.nameModalDesc")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            value={draft}
            maxLength={USERNAME_MAX_LENGTH}
            placeholder={t("public.usernamePlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
            }}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(randomUsername())}
            className="shrink-0"
            aria-label={t("public.usernameRandom")}
          >
            <Dices className="mr-2 size-4 sm:mr-0" />
            <span className="sm:hidden">{t("public.usernameRandom")}</span>
          </Button>
        </div>
        <Button onClick={confirm} disabled={!canConfirm} className="mt-4 w-full">
          {t("public.nameModalContinue")}
        </Button>
      </div>
    </div>
  );
}

function PublicText() {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
  const [text, setText] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [bold, setBold] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim()) return;
    if (!username.trim()) {
      toast.error(t("public.usernameRequired"));
      return;
    }
    setBusy(true);
    try {
      await endpoints.printText({ text, align, bold, username });
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
          <div className="flex flex-wrap gap-2">
            {(["left", "center", "right"] as const).map((a) => (
              <Button
                key={a}
                size="sm"
                variant={align === a ? "default" : "outline"}
                onClick={() => setAlign(a)}
                type="button"
                className="flex-1 sm:flex-none"
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
            className="w-full sm:w-auto"
          >
            {bold ? t("public.boldOn") : t("public.boldOff")}
          </Button>
        </div>
      </div>
      <Button onClick={run} disabled={busy || !text.trim()} className="w-full sm:w-auto">
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Send className="mr-2 size-4" />
        )}
        {t("public.print")}
      </Button>
    </div>
  );
}

function PublicDraw() {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
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
    if (!username.trim()) {
      toast.error(t("public.usernameRequired"));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await endpoints.printImage({ image: dataUrl, align: "center", username });
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
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          onClick={run}
          disabled={busy || !hasInk}
          className="w-full sm:w-auto"
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          {t("public.printDrawing")}
        </Button>
        <Button
          variant="outline"
          onClick={clear}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          <Eraser className="mr-2 size-4" /> {t("public.clear")}
        </Button>
      </div>
    </div>
  );
}
