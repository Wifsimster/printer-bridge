import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  showIcon = true,
}: {
  className?: string;
  showIcon?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {showIcon && <Globe className="h-4 w-4 text-muted-foreground" />}
      <select
        aria-label={t("common.language")}
        value={currentLang}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="rounded-md border bg-background px-2 py-1 text-sm"
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {t(`languages.${lng}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
