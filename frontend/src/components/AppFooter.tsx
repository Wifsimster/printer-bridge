import { useTranslation } from "react-i18next";

export function AppFooter() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const date = new Date(__BUILD_DATE__).toLocaleString(lang, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <footer className="border-t bg-background px-6 py-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{t("footer.version", { version: __APP_VERSION__ })}</span>
        <span>{t("footer.built", { date })}</span>
      </div>
    </footer>
  );
}
