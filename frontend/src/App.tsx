import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { endpoints, SetupStatus } from "@/lib/api";
import { AuthProvider, RequireAdmin } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Analytics } from "@/pages/Analytics";
import { Jobs } from "@/pages/Jobs";
import { Settings } from "@/pages/Settings";
import { TestPrint } from "@/pages/TestPrint";
import { Login } from "@/pages/Login";
import { SetupWizard } from "@/pages/SetupWizard";

export default function App() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints
      .setupStatus()
      .then(setStatus)
      .catch(() => setStatus({ setup_completed: false, has_token: false, has_host: false }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.setup_completed) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupWizard onComplete={() => setStatus({ ...status!, setup_completed: true })} />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route
            path="/analytics"
            element={
              <RequireAdmin>
                <Analytics />
              </RequireAdmin>
            }
          />
          <Route
            path="/test"
            element={
              <RequireAdmin>
                <TestPrint />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAdmin>
                <Settings />
              </RequireAdmin>
            }
          />
        </Route>
        <Route path="*" element={<RedirectHome />} />
      </Routes>
    </AuthProvider>
  );
}

function RedirectHome() {
  const nav = useNavigate();
  useEffect(() => {
    nav("/", { replace: true });
  }, [nav]);
  return null;
}
