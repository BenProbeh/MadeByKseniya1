import { config, reportConfigProblems } from "./config.js";
import { createApp } from "./app.js";
import { closeDb, startDb } from "./db.js";
import { backfillAppointmentPhones } from "./appointmentsService.js";
import { reportSmsSetup } from "./sms.js";

reportConfigProblems();
reportSmsSetup();

const app = createApp();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`made by kseniya API listening on 0.0.0.0:${config.port}`);
});

startDb()
  .then(() => backfillAppointmentPhones())
  .then((n) => n && console.log(`[db] normalised ${n} booking phone numbers`))
  .catch((err) => console.error("[db] booking phone backfill failed:", err?.code || "", err?.message));

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    closeDb().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
