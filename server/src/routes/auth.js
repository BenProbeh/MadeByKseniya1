import { Router } from "express";
import rateLimit from "express-rate-limit";
import db from "../db.js";
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

router.post("/register", authLimiter, (req, res) => {
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

  if (findUserByUsername(username)) {
    return fail(res, 409, "USERNAME_TAKEN", "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.");
  }

  let userId = null;
  try {
    const passwordHash = hashPassword(password);
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, first_name, last_name, last_login_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(username, passwordHash, firstName, lastName);

    userId = Number(info.lastInsertRowid);

    const oldToken = req.cookies?.[SESSION_COOKIE];
    if (oldToken) destroySessionByToken(oldToken);

    const session = createSession(userId, rememberMe);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));

    const user = publicUser(findUserByUsername(username));
    if (!user) {
      throw new Error("user missing after insert");
    }

    return res.status(201).json({ success: true, user });
  } catch (err) {
    console.error("register failed", err?.message);
    // Best-effort cleanup if user row was created but session/response failed
    if (userId) {
      try {
        db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
      } catch {
        /* ignore */
      }
    }
    return fail(res, 500, "REGISTRATION_FAILED", "לא הצלחנו ליצור את החשבון כרגע. נסי שוב בעוד רגע.");
  }
});

router.post("/login", authLimiter, (req, res) => {
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!username.trim() || !password) {
    return fail(res, 400, "INVALID_CREDENTIALS", "שם המשתמש או הסיסמה אינם נכונים");
  }

  const row = findUserByUsername(username);
  const ok = row && verifyPassword(password, row.password_hash);
  if (!ok) {
    return fail(res, 401, "INVALID_CREDENTIALS", "שם המשתמש או הסיסמה אינם נכונים");
  }

  try {
    const oldToken = req.cookies?.[SESSION_COOKIE];
    if (oldToken) destroySessionByToken(oldToken);

    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
      row.id
    );

    const session = createSession(row.id, rememberMe);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));

    const user = publicUser(findUserByUsername(row.username));
    return res.json({ success: true, user });
  } catch (err) {
    console.error("login failed", err?.message);
    return fail(res, 500, "LOGIN_FAILED", "לא הצלחנו להתחבר. נסי שוב.");
  }
});

router.post("/logout", optionalAuth, (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) destroySessionByToken(token);
  res.clearCookie(SESSION_COOKIE, cookieOptions(false, null));
  return res.json({ success: true, ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ success: true, user: req.user });
});

export default router;
