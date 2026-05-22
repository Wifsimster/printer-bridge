import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { endpoints, Me } from "@/lib/api";

type AuthState = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await endpoints.me());
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await endpoints.signOut();
    } catch {
      // best-effort; clear local state regardless
    }
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (me.role !== "admin") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">Admin role required</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          You are signed in as <span className="font-mono">{me.email}</span> (
          {me.role}). This page is restricted to administrators.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
