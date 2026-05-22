// Auth is now session-cookie based (better-auth via a sidecar). The previous
// localStorage bearer token is gone. We still POST to /api/auth/* through the
// FastAPI reverse proxy so everything stays same-origin and cookies "just work".

type FetchOptions = RequestInit & { auth?: boolean };

export async function api<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { auth: _auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: finalHeaders,
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const detail =
      (body && typeof body === "object" && "detail" in body
        ? (body as { detail: unknown }).detail
        : null) || res.statusText;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// -----------------------------------------------------------------------
// Typed endpoints
// -----------------------------------------------------------------------
export type SetupStatus = {
  setup_completed: boolean;
  has_token: boolean;
  has_host: boolean;
};

export type HealthResponse = {
  status: "ok" | "degraded";
  service: string;
  printer: { host: string; port: number; reachable: boolean };
};

export type ConfigResponse = {
  printer_host: string;
  printer_port: number;
  printer_codepage: string;
  printer_timeout: number;
  printer_retries: number;
  tz: string;
  setup_completed: boolean;
  token_set: boolean;
  token_preview: string;
};

export type Job = {
  id: number;
  ts: number;
  job_type: string;
  status: "success" | "error";
  duration_ms: number | null;
  attempts: number | null;
  error: string | null;
  source: string | null;
  payload_summary: string | null;
};

export type AnalyticsSummary = {
  totals: { success: number; error: number; all: number; success_rate: number };
  last_24h: { success: number; error: number };
  last_7d: { success: number; error: number };
  avg_duration_ms_7d: number;
  by_type_7d: { job_type: string; status: string; n: number }[];
  last_job: { ts: number; job_type: string; status: string; error: string | null } | null;
  recent_errors: { id: number; ts: number; job_type: string; error: string; source: string | null }[];
  printer_reachable: boolean;
  metrics: { success: number; error: number; last_job_ts: number };
};

export type TimeseriesResponse = {
  series: { ts: number; success: number; error: number }[];
  bucket_seconds: number;
};

export type Me = {
  id: string;
  email: string;
  name: string;
  role: "admin" | string;
};

export type PrinterCandidate = {
  host: string;
  port: number;
  name?: string;
  service?: string;
  method: "mdns" | "scan";
  reachable: boolean;
};

export const endpoints = {
  setupStatus: () => api<SetupStatus>("/api/setup/status", { auth: false }),
  me: () => api<Me>("/api/me"),
  signIn: (email: string, password: string) =>
    api<unknown>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () =>
    api<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
  generateToken: () =>
    api<{ token: string }>("/api/setup/generate-token", { method: "POST" }),
  testConnection: (printer_host: string, printer_port: number) =>
    api<{ reachable: boolean; host: string; port: number }>(
      "/api/setup/test-connection",
      { method: "POST", body: JSON.stringify({ printer_host, printer_port }) }
    ),
  discoverPrinters: () =>
    api<{ port: number; candidates: PrinterCandidate[] }>(
      "/api/setup/discover",
      { method: "POST" }
    ),
  completeSetup: (payload: Record<string, unknown>) =>
    api<{ status: string; config: ConfigResponse }>("/api/setup/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  health: () => api<HealthResponse>("/health", { auth: false }),
  config: () => api<ConfigResponse>("/api/config"),
  updateConfig: (payload: Record<string, unknown>) =>
    api<{ status: string; config: ConfigResponse }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  jobs: (params: { limit?: number; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api<{ jobs: Job[] }>(`/api/jobs${suffix}`);
  },
  analyticsSummary: () => api<AnalyticsSummary>("/api/analytics/summary"),
  timeseries: (hours: number) =>
    api<TimeseriesResponse>(`/api/analytics/timeseries?hours=${hours}`),
  printTest: () => api<{ status: string }>("/print/test", { method: "POST" }),
  printText: (payload: Record<string, unknown>) =>
    api<{ status: string }>("/print/text", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  printReceipt: (payload: Record<string, unknown>) =>
    api<{ status: string }>("/print/receipt", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  printImage: (payload: Record<string, unknown>) =>
    api<{ status: string }>("/print/image", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
