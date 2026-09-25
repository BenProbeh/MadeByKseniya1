import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import db from "./db.js";

export const SESSION_COOKIE = "mbk_session";
export const BCRYPT_ROUNDS = 12;
export const REMEMBER_DAYS = 30;
export const SESSION_HOURS = 12;

export function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compareSync(String(password), passwordHash);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url || null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
  };
}

export function findUserByUsername(username) {
  const u = normalizeUsername(username);
  if (!u) return null;
  return db.prepare(`SELECT * FROM users WHERE username = ?`).get(u) || null;
}

export function findUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) || null;
}

export function purgeExpiredSessions() {
  db.prepare(`DELETE FROM user_sessions WHERE expires_at < datetime('now')`).run();
}

export function createSession(userId, rememberMe) {
  purgeExpiredSessions();
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresMs = rememberMe
    ? REMEMBER_DAYS * 24 * 60 * 60 * 1000
    : SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(now + expiresMs).toISOString();

  db.prepare(
    `INSERT INTO user_sessions (user_id, token_hash, remember_me, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(userId, tokenHash, rememberMe ? 1 : 0, expiresAt);

  return { token, expiresAt, rememberMe: Boolean(rememberMe), maxAgeMs: rememberMe ? expiresMs : null };
}

export function destroySessionByToken(token) {
  if (!token) return;
  db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(hashToken(token));
}

export function destroyAllSessionsForUser(userId) {
  db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId);
}

export function getSessionUser(token) {
  if (!token) return null;
  purgeExpiredSessions();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.remember_me, u.*
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM user_sessions WHERE id = ?`).run(row.session_id);
    return null;
  }
  db.prepare(`UPDATE user_sessions SET last_used_at = datetime('now') WHERE id = ?`).run(row.session_id);
  return row;
}

export function cookieOptions(rememberMe, maxAgeMs) {
  const isProd = process.env.NODE_ENV === "production";
  // Cross-origin (Vercel → Railway) needs SameSite=None + Secure in production.
  const sameSite = process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax");
  const secure =
    process.env.COOKIE_SECURE === "1" ||
    process.env.COOKIE_SECURE === "true" ||
    isProd ||
    sameSite === "none";

  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  };
  if (rememberMe && maxAgeMs) {
    opts.maxAge = maxAgeMs;
  }
  return opts;
}

export function validateRegisterInput(body) {
  const errors = [];
  const firstName = String(body?.firstName || "").trim();
  const lastName = String(body?.lastName || "").trim();
  const username = normalizeUsername(body?.username);
  const password = String(body?.password || "");
  const confirmPassword = String(body?.confirmPassword || "");

  if (!firstName || firstName.length < 2) errors.push("יש להזין שם פרטי.");
  if (firstName.length > 60) errors.push("שם פרטי ארוך מדי.");
  if (!lastName || lastName.length < 2) errors.push("יש להזין שם משפחה.");
  if (lastName.length > 60) errors.push("שם משפחה ארוך מדי.");
  if (!username || username.length < 3) errors.push("שם משתמש חייב להכיל לפחות 3 תווים.");
  if (username.length > 40) errors.push("שם משתמש ארוך מדי.");
  if (!/^[a-z0-9._-]+$/.test(username)) {
    errors.push("שם משתמש יכול להכיל אותיות באנגלית, מספרים, נקודה, מקף וקו תחתון.");
  }
  if (password.length < 8) errors.push("הסיסמה חייבת להכיל לפחות 8 תווים.");
  if (password.length > 128) errors.push("הסיסמה ארוכה מדי.");
  if (password !== confirmPassword) errors.push("אימות הסיסמה אינו תואם.");

  return {
    ok: errors.length === 0,
    errors,
    data: {
      firstName,
      lastName,
      username,
      password,
      rememberMe: Boolean(body?.rememberMe),
    },
  };
}
