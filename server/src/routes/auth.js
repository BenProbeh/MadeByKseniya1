import { Router } from "express";
import rateLimit from "express-rate-limit";
import db, { transaction } from "../db.js";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySessionByToken,
  findUserByUsername,
  hashPassword,
  publicUser,
  validateRegisterInput,
  verifyPassword,
} from "../auth.js";
import { optionalAuth, requireAuth } from "../middleware/authMiddleware.js";
import { asyncRoute, sendServiceUnavailable } from "../http.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.",
    },
  },
});

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
    // Back-compat string for older clients
    errorMessage: message,
  });
}

const USERNAME_TAKEN_MESSAGE = "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.";

router.post(
  "/register",
  authLimiter,
  asyncRoute(async (req, res) => {
    const checked = validateRegisterInput(req.body || {});
    if (!checked.ok) {
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        checked.errors[0] || "יש לבדוק את הפרטים שמילאת ולנסות שוב."
      );
    }

    const { firstName, lastName, username, password, rememberMe } = checked.data;

    try {
      if (await findUserByUsername(username)) {
        return fail(res, 409, "USERNAME_TAKEN", USERNAME_TAKEN_MESSAGE);
      }

      const passwordHash = await hashPassword(password);

      // User row and session are created atomically: no orphan accounts without a session.
      const { row, session } = await transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO users (username, password_hash, first_name, last_name, last_login_at)
           VALUES ($1, $2, $3, $4, now())
           RETURNING *`,
          [username, passwordHash, firstName, lastName]
        );
        const created = inserted.rows[0];
        const newSession = await createSession(created.id, rememberMe, tx);
        return { row: created, session: newSession };
      });

      const oldToken = req.cookies?.[SESSION_COOKIE];
      if (oldToken) await destroySessionByToken(oldToken).catch(() => {});

      res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));
      return res.status(201).json({ success: true, user: publicUser(row) });
    } catch (err) {
      if (err?.code === "23505") {
        return fail(res, 409, "USERNAME_TAKEN", USERNAME_TAKEN_MESSAGE);
      }
      if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      console.error("register failed:", err?.code || "", err?.message);
      return fail(
        res,
        500,
        "REGISTRATION_FAILED",
        "לא הצלחנו ליצור את החשבון כרגע. נסי שוב בעוד רגע."
      );
    }
  })
);

router.post(
  "/login",
  authLimiter,
  asyncRoute(async (req, res) => {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!username.trim() || !password) {
      return fail(res, 400, "INVALID_CREDENTIALS", "שם המשתמש או הסיסמה אינם נכונים");
    }

    try {
      const row = await findUserByUsername(username);
      const ok = row && (await verifyPassword(password, row.password_hash));
      if (!ok) {
        return fail(res, 401, "INVALID_CREDENTIALS", "שם המשתמש או הסיסמה אינם נכונים");
      }

      const oldToken = req.cookies?.[SESSION_COOKIE];
      if (oldToken) await destroySessionByToken(oldToken);

      const { rows } = await db.query(
        `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
        [row.id]
      );

      const session = await createSession(row.id, rememberMe);
      res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));

      return res.json({ success: true, user: publicUser(rows[0]) });
    } catch (err) {
      if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      console.error("login failed:", err?.code || "", err?.message);
      return fail(res, 500, "LOGIN_FAILED", "לא הצלחנו להתחבר. נסי שוב.");
    }
  })
);

router.post(
  "/logout",
  optionalAuth,
  asyncRoute(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await destroySessionByToken(token).catch(() => {});
    res.clearCookie(SESSION_COOKIE, cookieOptions(false, null));
    return res.json({ success: true, ok: true });
  })
);

router.get("/me", requireAuth, (req, res) => {
  return res.json({ success: true, user: req.user });
});

export default router;
