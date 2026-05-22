import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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

const nav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
  { to: "/admin/jobs", label: "Jobs", icon: ListChecks },
  { to: "/admin/draw", label: "Draw", icon: Brush },
  { to: "/admin/test", label: "Test print", icon: TestTube2, adminOnly: true },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, loading: authLoading, signOut } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
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
        <div className="border-t p-3 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => navigate("/")}
          >
            <Home className="mr-2 h-4 w-4" /> Public page
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
            <LogOut className="mr-2 h-4 w-4" />
            {me ? `Sign out (${me.email})` : "Sign out"}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>Printer</span>
            <span className="font-mono text-foreground">
              {health?.printer?.host || "unknown"}:{health?.printer?.port || "—"}
            </span>
            {health ? (
              health.printer.reachable ? (
                <Badge variant="success">reachable</Badge>
              ) : (
                <Badge variant="destructive">unreachable</Badge>
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
      </div>
    </div>
  );
}
