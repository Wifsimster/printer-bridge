import { PointerEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ApiError, endpoints } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;

export function Public() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const signedIn = Boolean(me);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-16 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold tracking-tight">printcast</span>
        </div>
        <Button
          variant={signedIn ? "default" : "outline"}
          size="sm"
          onClick={() => navigate(signedIn ? "/admin" : "/login")}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {signedIn ? "Admin console" : "Admin login"}
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Print something</h1>
          <p className="text-sm text-muted-foreground">
            Send a message or a drawing straight to the thermal printer.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>Type a message or draw, then hit print.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="text">
              <TabsList>
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="draw">Drawing</TabsTrigger>
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
    </div>
  );
}

function PublicText() {
  const [text, setText] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [bold, setBold] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await endpoints.printText({ text, align, bold });
      toast.success("Text printed");
      setText("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="public-text">Your message</Label>
        <Textarea
          id="public-text"
          rows={6}
          placeholder="Write something to print…"
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

function PublicDraw() {
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
      toast.success("Drawing printed");
      clear();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Draw with your finger or mouse. The canvas is printed centered.
      </p>
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
          Print drawing
        </Button>
        <Button variant="outline" onClick={clear} disabled={busy}>
          <Eraser className="mr-2 h-4 w-4" /> Clear
        </Button>
      </div>
    </div>
  );
}
