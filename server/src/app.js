import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import servicesRouter from "./routes/services.js";
import appointmentsRouter from "./routes/appointments.js";
import chatRouter from "./routes/chat.js";
import measurementsRouter from "./routes/measurements.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPasswordResetRouter } from "./routes/passwordReset.js";
import profileRouter from "./routes/profile.js";
import { createProfileEmailRouter } from "./routes/profileEmail.js";
import adminRouter from "./routes/admin.js";
import ownerRouter from "./routes/owner.js";
import { adminContentRouter, publicContentRouter } from "./routes/content.js";
import db, { pingDb } from "./db.js";
import { hasOwner } from "./roles.js";
import { emailSetupProblems, emailStatus, handleResendWebhook } from "./email/mailer.js";
import { createCodeLimits } from "./codeLimits.js";
import { asyncRoute, sendServiceUnavailable } from "./http.js";
import { loadAvatar } from "./storage/avatarStorage.js";

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createApp() {
  const app = express();
  const isProd = config.isProduction;
  const allowedOrigins = config.frontendOrigins.filter((o) => o !== "*");

  // Vercel proxy → Railway edge is two hops; set TRUST_PROXY=2 there so rate limits see the real client IP.
  app.set("trust proxy", config.trustProxy);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        if (!isProd && LOCAL_ORIGIN_RE.test(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    })
  );

  // Signature verification needs the exact raw bytes, so this route is mounted before the JSON parser.
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "*/*", limit: "256kb" }),
    asyncRoute(async (req, res) => {
      const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const { status } = await handleResendWebhook(payload, req.headers);
      res.status(status).json({ ok: status === 200 });
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const connected = await pingDb();
    if (connected) {
      const ownerAssigned = await hasOwner(db).catch(() => null);
      const emailSetup = emailSetupProblems();
      return res.json({
        ok: true,
        database: "connected",
        ownerAssigned,
        email: emailStatus(),
        ...(emailSetup.length ? { emailSetup } : {}),
      });
    }
    return res.status(503).json({ ok: false, database: "disconnected" });
  });

  app.get(
    "/api/uploads/avatars/:name",
    asyncRoute(async (req, res) => {
      const avatar = await loadAvatar(req.params.name);
      if (!avatar) return res.status(404).json({ error: "not found" });
      res.set("Content-Type", avatar.mime);
      res.set("Cache-Control", "public, max-age=604800, immutable");
      res.set("X-Content-Type-Options", "nosniff");
      return res.send(avatar.data);
    })
  );

  app.use(["/api/auth", "/api/profile", "/api/admin", "/api/owner", "/api/content"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  const codeLimits = createCodeLimits();
  app.use("/api/auth/password-reset", createPasswordResetRouter(codeLimits));
  app.use("/api/auth", createAuthRouter(codeLimits));
  app.use("/api/profile/email", createProfileEmailRouter(codeLimits));
  app.use("/api/profile", profileRouter);
  app.use("/api/admin/content", adminContentRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/content", publicContentRouter);
  app.use("/api/owner", ownerRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api/appointments", appointmentsRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/measurements", measurementsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "הנתיב לא נמצא." } });
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({ error: "הבקשה גדולה מדי." });
    }
    if (err?.code === "DB_UNAVAILABLE") {
      return sendServiceUnavailable(res);
    }
    console.error("unhandled", err?.code || "", err?.message);
    res.status(500).json({ error: "שגיאת שרת" });
  });

  return app;
}
