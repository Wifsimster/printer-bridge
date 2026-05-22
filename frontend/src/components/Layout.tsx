import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BarChart3,
  Brush,
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
import { AppFooter } from "@/components/AppFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { endpoints, HealthResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
  const { t } = useTranslation();
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

  return (
    <div className="app-shell-bg flex min-h-screen">
      <aside className="hidden w-64 flex-col border-r border-border/60 bg-card/40 backdrop-blur md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border/60 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info text-primary-foreground shadow-soft">
            <Printer className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">printcast</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              print bridge
            </span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary shadow-soft"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <item.icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border/60 p-3">
          {me ? (
            <div
              className="truncate rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground"
              title={me.email}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                {me.role === "admin" ? "admin" : "user"}
              </div>
              <div className="truncate text-foreground">{me.email}</div>
            </div>
          ) : null}
          <PrinterStatusCard health={health} />
          <LanguageSwitcher className="w-full" />
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/")}
          >
            <Home className="mr-2 h-4 w-4" /> {t("nav.publicPage")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
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
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-info text-primary-foreground">
                <Printer className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold">printcast</span>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs md:flex">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t("header.printer")}</span>
              <span className="font-mono text-foreground">
                {health?.printer?.host || t("header.unknown")}:
                {health?.printer?.port || t("common.dash")}
              </span>
              {health ? (
                health.printer.reachable ? (
                  <Badge variant="success" className="ml-1">
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                    {t("header.reachable")}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ml-1">
                    {t("header.unreachable")}
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="ml-1">
                  …
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 md:hidden">
              {visibleNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md p-2 transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent/50"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                </NavLink>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}

function PrinterStatusCard({ health }: { health: HealthResponse | null }) {
  const reachable = health?.printer.reachable;
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Printer
        </span>
        <span
          className={cn(
            "flex h-2 w-2 rounded-full",
            reachable === true && "bg-success shadow-[0_0_0_3px_hsl(var(--success-soft))]",
            reachable === false && "bg-destructive",
            reachable == null && "bg-muted-foreground/40"
          )}
        />
      </div>
      <p className="truncate font-mono text-xs">
        {health?.printer?.host || "unknown"}
        <span className="text-muted-foreground">:{health?.printer?.port || "—"}</span>
      </p>
    </div>
  );
}
