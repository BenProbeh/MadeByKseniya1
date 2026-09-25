import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import servicesRouter from "./routes/services.js";
import appointmentsRouter from "./routes/appointments.js";
import chatRouter from "./routes/chat.js";
import measurementsRouter from "./routes/measurements.js";
import authRouter from "./routes/auth.js";
import profileRouter from "./routes/profile.js";
import { uploadsRoot } from "./db.js";

export function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.set("trust proxy", 1);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          return cb(null, true);
        }
        if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }
        return cb(null, false);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use("/uploads/avatars", express.static(uploadsRoot, { maxAge: "7d", fallthrough: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api/appointments", appointmentsRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/measurements", measurementsRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({ error: "הבקשה גדולה מדי." });
    }
    console.error("unhandled", err?.message);
    res.status(500).json({ error: "שגיאת שרת" });
  });

  return app;
}
