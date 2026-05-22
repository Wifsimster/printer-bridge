import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Eraser, Loader2, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError, endpoints } from "@/lib/api";

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 600;
const BRUSH_SIZES = [4, 8, 14, 22];

type Point = { x: number; y: number };
type Stroke = { points: Point[]; size: number; erase: boolean };

export function Draw() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const activePointerRef = useRef<number | null>(null);

  const [brush, setBrush] = useState(8);
  const [erase, setErase] = useState(false);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length === 0) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.erase ? "#ffffff" : "#000000";
    ctx.lineWidth = s.size;
    ctx.beginPath();
    const [first, ...rest] = s.points;
    ctx.moveTo(first.x, first.y);
    if (rest.length === 0) {
      // Single tap: draw a dot
      ctx.lineTo(first.x + 0.01, first.y + 0.01);
    } else {
      for (const p of rest) ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }, []);

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    paintBackground(ctx);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (currentRef.current) drawStroke(ctx, currentRef.current);
    setHasInk(strokesRef.current.some((s) => !s.erase) || !!currentRef.current);
  }, [drawStroke, paintBackground]);

  // Initial paint
  useEffect(() => {
    redraw();
  }, [redraw]);

  const toCanvasCoords = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== null) return;
    e.preventDefault();
    activePointerRef.current = e.pointerId;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = toCanvasCoords(e);
    currentRef.current = { points: [p], size: brush, erase };
    redraw();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId || !currentRef.current) return;
    e.preventDefault();
    currentRef.current.points.push(toCanvasCoords(e));
    redraw();
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    activePointerRef.current = null;
    if (currentRef.current) {
      strokesRef.current.push(currentRef.current);
      currentRef.current = null;
    }
    redraw();
  };

  const undo = () => {
    strokesRef.current.pop();
    redraw();
  };

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    redraw();
  };

  const print = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    setBusy(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await endpoints.printImage({
        image: dataUrl,
        align: "center",
        caption: caption.trim() || undefined,
        cut: true,
      });
      toast.success(t("draw.sent"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("draw.failed"));
    } finally {
      setBusy(false);
    }
  };

  // Prevent page scroll while drawing on touch devices: the canvas itself uses
  // touch-action: none, but the wrapper guards against rubber-band scrolling.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (activePointerRef.current !== null) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("draw.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("draw.description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("draw.cardTitle")}</CardTitle>
          <CardDescription>{t("draw.cardDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={erase ? "outline" : "default"}
              onClick={() => setErase(false)}
            >
              <Pencil className="mr-2 h-4 w-4" /> {t("draw.pencil")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={erase ? "default" : "outline"}
              onClick={() => setErase(true)}
            >
              <Eraser className="mr-2 h-4 w-4" /> {t("draw.eraser")}
            </Button>

            <div className="mx-2 hidden h-6 w-px bg-border sm:block" />

            <div className="flex items-center gap-1">
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={t("draw.brushAria", { size: s })}
                  onClick={() => setBrush(s)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    brush === s
                      ? "border-primary bg-primary/10"
                      : "border-input hover:bg-accent"
                  )}
                >
                  <span
                    className="block rounded-full bg-foreground"
                    style={{
                      width: Math.max(4, s / 1.5),
                      height: Math.max(4, s / 1.5),
                    }}
                  />
                </button>
              ))}
            </div>

            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={undo}
                disabled={strokesRef.current.length === 0}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> {t("draw.undo")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clear}
                disabled={!hasInk && strokesRef.current.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t("draw.clearAction")}
              </Button>
            </div>
          </div>

          <div
            ref={wrapperRef}
            className="mx-auto w-full max-w-[480px] overflow-hidden rounded-md border bg-white"
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={endStroke}
              className="block h-auto w-full select-none touch-none"
              style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">{t("draw.caption")}</Label>
            <Input
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t("draw.captionPlaceholder")}
              maxLength={80}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={print} disabled={busy || !hasInk}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {t("draw.print")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
