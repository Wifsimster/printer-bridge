import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  // `undefined` means the initial /me request has not resolved yet, which is
  // exactly the "loading" condition — derive it during render instead of
  // mirroring it into a separate state value.
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const loading = me === undefined;

  const refresh = useCallback(async () => {
    try {
      setMe(await endpoints.me());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await endpoints.signOut();
    } catch {
      // best-effort; clear local state regardless
    }
    setMe(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ me: me ?? null, loading, refresh, signOut }),
    [me, loading, refresh, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
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
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (me.role !== "admin") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <ShieldAlert className="size-10 text-destructive" />
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
