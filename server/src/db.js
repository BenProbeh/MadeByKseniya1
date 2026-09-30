import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";
import { runMigrations } from "./migrations.js";
import { ensureOwner } from "./roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let backend = null;
let status = "idle"; // idle | connecting | connected | disconnected
let startPromise = null;

function dbUnavailableError() {
  const err = new Error("database unavailable");
  err.code = "DB_UNAVAILABLE";
  return err;
}

function describeError(err) {
  // Connection strings are never included in pg error messages; keep code + message only.
  return [err?.code, err?.message].filter(Boolean).join(" ");
}

function createPostgresBackend(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[db] idle client error:", describeError(err));
  });

  const wrap = (runner) => ({
    query: (text, params) => runner.query(text, params),
    exec: (sql) => runner.query(sql),
  });

  return {
    kind: "postgres",
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createEmbeddedBackend() {
  // Development and tests only: real Postgres engine running in-process (not a file-based substitute).
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = config.localDbDir || path.join(__dirname, "..", ".pgdata");
  const db = new PGlite(dataDir === "memory://" ? undefined : dataDir);
  await db.waitReady;

  const wrap = (runner) => ({
    query: async (text, params) => {
      const res = await runner.query(text, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    exec: (sql) => runner.exec(sql),
  });

  return {
    kind: "embedded-postgres",
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
  };
}

async function createBackend() {
  if (config.databaseUrl) return createPostgresBackend(config.databaseUrl);
  if (config.isProduction) {
    const err = new Error("DATABASE_URL is not set");
    err.code = "DATABASE_URL_MISSING";
    throw err;
  }
  return createEmbeddedBackend();
}

async function connectOnce() {
  const next = await createBackend();
  try {
    await next.query("SELECT 1");
    const applied = await runMigrations(next);
    await ensureOwner(next, config.ownerUserId);
    backend = next;
    status = "connected";
    console.log(
      `[db] connected (${next.kind})${applied.length ? `; applied migrations: ${applied.join(", ")}` : ""}`
    );
  } catch (err) {
    await next.close().catch(() => {});
    throw err;
  }
}

/**
 * Connect and migrate in the background. Retries with backoff so a slow or
 * temporarily unavailable database never crashes the HTTP server.
 */
export function startDb() {
  if (startPromise) return startPromise;
  status = "connecting";
  startPromise = (async () => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await connectOnce();
        return;
      } catch (err) {
        status = "disconnected";
        console.error(`[db] connection attempt ${attempt} failed: ${describeError(err)}`);
        if (err?.code === "DATABASE_URL_MISSING") return;
        await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * attempt)));
        status = "connecting";
      }
    }
  })();
  return startPromise;
}

async function getBackend() {
  if (status === "connected" && backend) return backend;
  if (!startPromise) startDb();
  await Promise.race([startPromise, new Promise((r) => setTimeout(r, 8_000))]);
  if (status === "connected" && backend) return backend;
  throw dbUnavailableError();
}

export async function query(text, params = []) {
  const b = await getBackend();
  return b.query(text, params);
}

export async function transaction(fn) {
  const b = await getBackend();
  return b.transaction(fn);
}

/** True when PostgreSQL answers a trivial query right now. */
export async function pingDb() {
  if (status !== "connected" || !backend) return false;
  try {
    await backend.query("SELECT 1");
    return true;
  } catch (err) {
    console.error("[db] health check failed:", describeError(err));
    return false;
  }
}

export async function closeDb() {
  const b = backend;
  backend = null;
  startPromise = null;
  status = "idle";
  if (b) await b.close().catch(() => {});
}

export default { query, transaction };
