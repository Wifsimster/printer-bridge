import express from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, db } from "./auth.js";

const PORT = Number(process.env.AUTH_PORT ?? 8090);
const HOST = process.env.AUTH_HOST ?? "127.0.0.1";

const app = express();

// Better-auth must see the raw request, so mount its handler BEFORE express.json().
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

// Health probe for the FastAPI proxy / container healthcheck.
app.get("/__auth/health", (_req, res) => {
  res.json({ status: "ok", service: "printcast-auth" });
});

// Whether any user exists yet. Used by the setup wizard to gate first-run signup.
app.get("/__auth/has-users", (_req, res) => {
  const row = db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number } | undefined;
  res.json({ has_users: !!(row && row.n > 0), count: row?.n ?? 0 });
});

// Create the first user (idempotent only if no users exist) and grant admin role.
// Called by the FastAPI setup wizard so we can guarantee "first user = admin"
// without exposing public signup.
app.post("/__auth/bootstrap-admin", async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  const existing = db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number } | undefined;
  if (existing && existing.n > 0) {
    res.status(409).json({ error: "an admin already exists" });
    return;
  }
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: name ?? email },
    });
    const userId = (result as { user?: { id?: string } })?.user?.id;
    if (!userId) {
      res.status(500).json({ error: "signup did not return a user id" });
      return;
    }
    db.prepare("UPDATE user SET role = ? WHERE id = ?").run("admin", userId);
    res.json({ status: "ok", user_id: userId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Internal endpoint: validate a session cookie from FastAPI's perspective.
// FastAPI forwards the incoming cookie header here and gets back the user
// (with role) or 401. Cheaper than re-implementing the cookie + cache logic in
// Python and keeps the source of truth inside better-auth.
app.get("/__auth/whoami", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      res.status(401).json({ error: "no session" });
      return;
    }
    res.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: (session.user as { role?: string }).role ?? "user",
      },
    });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    event: "auth.listening",
    host: HOST,
    port: PORT,
    base_url: process.env.AUTH_BASE_URL,
  }));
});
