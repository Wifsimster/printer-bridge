import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Printer,
  Settings as SettingsIcon,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { clearToken, endpoints, getToken, HealthResponse } from "@/lib/api";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/jobs", label: "Jobs", icon: ListChecks },
  { to: "/test", label: "Test print", icon: TestTube2 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    if (!getToken()) {
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
  }, [navigate, location.pathname]);

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
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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
        <div className="border-t border-border/60 p-3">
          <PrinterStatusCard health={health} />
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => {
              clearToken();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
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
              <span className="text-muted-foreground">Printer</span>
              <span className="font-mono text-foreground">
                {health?.printer?.host || "unknown"}:{health?.printer?.port || "—"}
              </span>
              {health ? (
                health.printer.reachable ? (
                  <Badge variant="success" className="ml-1">
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                    online
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ml-1">
                    offline
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="ml-1">…</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 md:hidden">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
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
