import { config, reportConfigProblems } from "./config.js";
import { createApp } from "./app.js";
import { closeDb, startDb } from "./db.js";

reportConfigProblems();

const app = createApp();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`made by kseniya API listening on 0.0.0.0:${config.port}`);
});

startDb();

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
