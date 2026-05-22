import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "@/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return i18n.t("common.dash");
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return i18n.t("common.dash");
  const date = new Date(ts * 1000);
  return date.toLocaleString(i18n.language);
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return i18n.t("common.never");
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return i18n.t("common.secondsAgo", { n: Math.floor(diff) });
  if (diff < 3600) return i18n.t("common.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t("common.hoursAgo", { n: Math.floor(diff / 3600) });
  return i18n.t("common.daysAgo", { n: Math.floor(diff / 86400) });
}
