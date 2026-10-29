/**
 * API server for the browser end-to-end tests (client/e2e). Never used in production.
 *
 * - Database: a fresh in-memory embedded Postgres per run (DATABASE_URL is refused).
 * - Email: the in-memory outbox; tests read codes from GET /__e2e/outbox.
 * - POST /__e2e/owner/:id makes a test account the site owner (the real bootstrap needs a restart).
 * These two helpers exist only in this script, not in the app the API ships.
 */
process.env.NODE_ENV = "test";
process.env.EMAIL_PROVIDER = "memory";
process.env.MAIL_PROVIDER = "memory";
process.env.PGLITE_DIR = "memory://";
process.env.OPENAI_API_KEY = "";
if (process.env.DATABASE_URL) {
  console.error("e2e-server refuses to run with DATABASE_URL set");
  process.exit(1);
}
process.env.DATABASE_URL = "";

const port = Number(process.env.E2E_API_PORT || 4100);
const { createApp } = await import("../src/app.js");
const db = (await import("../src/db.js")).default;
const { startDb } = await import("../src/db.js");
const { ensureOwner } = await import("../src/roles.js");
const { emailTestOutbox, settleEmailJobs } = await import("../src/email/mailer.js");
const express = (await import("express")).default;

await startDb();

const app = express();
app.get("/__e2e/outbox", async (req, res) => {
  await settleEmailJobs();
  const to = String(req.query.to || "").toLowerCase();
  res.json(emailTestOutbox.filter((m) => !to || m.to === to).map(({ to, subject, text }) => ({ to, subject, text })));
});
app.post("/__e2e/owner/:id", async (req, res) => {
  res.json(await ensureOwner(db, Number(req.params.id)));
});
app.use(createApp());

app.listen(port, "127.0.0.1", () => console.log(`[e2e] API on http://127.0.0.1:${port}`));
