import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import Database from "better-sqlite3";
import path from "node:path";

const DATA_DIR = process.env.PRINTCAST_DATA_DIR ?? "/app/data";
const DB_PATH = path.join(DATA_DIR, "auth.db");
const BASE_URL = process.env.AUTH_BASE_URL ?? "http://localhost:8090";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Better-auth doesn't auto-create its tables; we create them up-front so a
// fresh container is usable without an extra migrate step. The schema mirrors
// the documented better-auth core schema plus the `admin` plugin fields
// (role, banned, banReason, banExpires, impersonatedBy).
function ensureSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      role TEXT,
      banned INTEGER,
      banReason TEXT,
      banExpires INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expiresAt INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL,
      impersonatedBy TEXT,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);
    CREATE INDEX IF NOT EXISTS session_token_idx ON session(token);

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      accessTokenExpiresAt INTEGER,
      refreshTokenExpiresAt INTEGER,
      scope TEXT,
      password TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
  `);
}

ensureSchema();

export const auth = betterAuth({
  database: db,
  baseURL: BASE_URL,
  basePath: "/api/auth",
  secret:
    process.env.AUTH_SECRET ??
    (() => {
      throw new Error("AUTH_SECRET env var is required");
    })(),
  trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [admin()],
});

export { db };
