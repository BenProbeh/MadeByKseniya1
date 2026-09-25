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
  message: { error: "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות." },
});

router.post("/register", authLimiter, (req, res) => {
  const checked = validateRegisterInput(req.body || {});
  if (!checked.ok) {
    return res.status(400).json({ error: checked.errors[0], errors: checked.errors });
  }

  const { firstName, lastName, username, password, rememberMe } = checked.data;

  if (findUserByUsername(username)) {
    return res.status(409).json({ error: "שם המשתמש כבר תפוס. בחרי שם אחר." });
  }

  try {
    const passwordHash = hashPassword(password);
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, first_name, last_name, last_login_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(username, passwordHash, firstName, lastName);

    const userId = Number(info.lastInsertRowid);

    // Prevent session fixation — always mint a fresh session after register
    const oldToken = req.cookies?.[SESSION_COOKIE];
    if (oldToken) destroySessionByToken(oldToken);

    const session = createSession(userId, rememberMe);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));

    const user = publicUser(findUserByUsername(username));
    return res.status(201).json({ user });
  } catch (err) {
    console.error("register failed", err?.message);
    return res.status(500).json({ error: "לא הצלחנו ליצור את החשבון. נסי שוב." });
  }
});

router.post("/login", authLimiter, (req, res) => {
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!username.trim() || !password) {
    return res.status(400).json({ error: "שם המשתמש או הסיסמה אינם נכונים" });
  }

  const row = findUserByUsername(username);
  const ok = row && verifyPassword(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "שם המשתמש או הסיסמה אינם נכונים" });
  }

  try {
    const oldToken = req.cookies?.[SESSION_COOKIE];
    if (oldToken) destroySessionByToken(oldToken);

    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
      row.id
    );

    const session = createSession(row.id, rememberMe);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));

    return res.json({ user: publicUser(findUserByUsername(row.username)) });
  } catch (err) {
    console.error("login failed", err?.message);
    return res.status(500).json({ error: "לא הצלחנו להתחבר. נסי שוב." });
  }
});

router.post("/logout", optionalAuth, (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) destroySessionByToken(token);
  res.clearCookie(SESSION_COOKIE, cookieOptions(false, null));
  return res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
