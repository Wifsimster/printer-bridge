import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, endpoints } from "@/lib/api";
import { usePublicUsername } from "@/lib/publicUsername";
import {
  FORTUNE_CATEGORIES,
  FortuneCategory,
  pickFortune,
} from "@/lib/fortunes";

export function PublicFortune() {
  const { t, i18n } = useTranslation();
  const { username } = usePublicUsername();
  const [category, setCategory] = useState<FortuneCategory>("motivational");
  const [current, setCurrent] = useState<string>(() =>
    pickFortune("motivational", i18n.language)
  );
  const [busy, setBusy] = useState(false);

  const categoryLabels = useMemo<Record<FortuneCategory, string>>(
    () => ({
      motivational: t("public.fortune.catMotivational"),
      jokes: t("public.fortune.catJokes"),
      compliments: t("public.fortune.catCompliments"),
      proverbs: t("public.fortune.catProverbs"),
    }),
    [t]
  );

  function shuffle(next?: FortuneCategory) {
    const c = next ?? category;
    setCategory(c);
    setCurrent(pickFortune(c, i18n.language));
  }

  async function run() {
    if (!current) return;
    if (!username.trim()) {
      toast.error(t("public.usernameRequired"));
      return;
    }
    setBusy(true);
    try {
      await endpoints.printText({
        text: current,
        align: "left",
        bold: false,
        username,
      });
      toast.success(t("public.fortune.printed"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("public.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("public.fortune.intro")}</p>
      <div className="space-y-2">
        <Label>{t("public.fortune.category")}</Label>
        <div className="flex flex-wrap gap-2">
          {FORTUNE_CATEGORIES.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => shuffle(c)}
            >
              {categoryLabels[c]}
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed">{current}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={run} disabled={busy || !current}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          {t("public.fortune.print")}
        </Button>
        <Button variant="outline" onClick={() => shuffle()} disabled={busy}>
          <RefreshCw className="mr-2 size-4" />
          {t("public.fortune.shuffle")}
        </Button>
      </div>
    </div>
  );
}
