import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BarChart3,
  Brush,
  Globe,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Printer,
  Settings as SettingsIcon,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { endpoints, HealthResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_LANGUAGES } from "@/i18n";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  adminOnly?: boolean;
};

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { me, loading: authLoading, signOut } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const nav: NavItem[] = [
    { to: "/admin", label: t("nav.dashboard"), icon: LayoutDashboard, end: true },
    { to: "/admin/analytics", label: t("nav.analytics"), icon: BarChart3, adminOnly: true },
    { to: "/admin/jobs", label: t("nav.jobs"), icon: ListChecks },
    { to: "/admin/draw", label: t("nav.draw"), icon: Brush },
    { to: "/admin/test", label: t("nav.testPrint"), icon: TestTube2, adminOnly: true },
    { to: "/admin/settings", label: t("nav.settings"), icon: SettingsIcon, adminOnly: true },
  ];
  const visibleNav = nav.filter((item) => !item.adminOnly || me?.role === "admin");

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    const tick = () =>
      endpoints
        .health()
        .then((h) => !cancelled && setHealth(h))
        .catch(() => !cancelled && setHealth(null));
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [navigate, location.pathname, authLoading, me]);

  const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Printer className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold tracking-tight">printcast</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3 space-y-2">
          {me ? (
            <div
              className="px-3 pb-1 text-xs text-muted-foreground truncate"
              title={me.email}
            >
              {me.email}
            </div>
          ) : null}
          <div className="flex items-center gap-2 px-1">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label={t("common.language")}
              value={currentLang}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng}>
                  {t(`languages.${lng}`)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => navigate("/")}
          >
            <Home className="mr-2 h-4 w-4" /> {t("nav.publicPage")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              navigate("/", { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> {t("common.signOut")}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>{t("header.printer")}</span>
            <span className="font-mono text-foreground">
              {health?.printer?.host || t("header.unknown")}:{health?.printer?.port || t("common.dash")}
            </span>
            {health ? (
              health.printer.reachable ? (
                <Badge variant="success">{t("header.reachable")}</Badge>
              ) : (
                <Badge variant="destructive">{t("header.unreachable")}</Badge>
              )
            ) : (
              <Badge variant="outline">…</Badge>
            )}
          </div>
          <nav className="flex gap-1 md:hidden">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md p-2",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
        <footer className="border-t bg-background px-6 py-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("footer.version", { version: __APP_VERSION__ })}</span>
            <span>
              {t("footer.built", {
                date: new Date(__BUILD_DATE__).toLocaleString(currentLang, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
