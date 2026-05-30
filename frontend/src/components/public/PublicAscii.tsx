import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, endpoints } from "@/lib/api";
import { usePublicUsername } from "@/lib/publicUsername";
import { ASCII_GALLERY, asciiSceneToText, AsciiScene } from "@/lib/ascii";

export function PublicAscii() {
  const { t } = useTranslation();
  const { username } = usePublicUsername();
  const [selectedId, setSelectedId] = useState<string>(ASCII_GALLERY[0].id);
  const [busy, setBusy] = useState(false);

  const selected = useMemo<AsciiScene>(
    () =>
      ASCII_GALLERY.find((s) => s.id === selectedId) ?? ASCII_GALLERY[0],
    [selectedId]
  );

  async function run() {
    if (!username.trim()) {
      toast.error(t("public.usernameRequired"));
      return;
    }
    setBusy(true);
    try {
      await endpoints.printText({
        text: asciiSceneToText(selected),
        align: "center",
        bold: false,
        username,
      });
      toast.success(t("public.ascii.printed"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("public.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("public.ascii.intro")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ASCII_GALLERY.map((scene) => {
          const isActive = scene.id === selectedId;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => setSelectedId(scene.id)}
              className={`flex flex-col items-center gap-2 rounded-md border p-3 text-left transition-colors ${
                isActive
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
              aria-pressed={isActive}
            >
              <pre className="whitespace-pre overflow-hidden font-mono text-[11px] leading-tight">
                {scene.lines.join("\n")}
              </pre>
              <span className="text-xs font-medium">
                {t(`public.ascii.names.${scene.id}`, { defaultValue: scene.id })}
              </span>
            </button>
          );
        })}
      </div>
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Send className="mr-2 size-4" />
        )}
        {t("public.ascii.print")}
      </Button>
    </div>
  );
}
