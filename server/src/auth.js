import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { config } from "./config.js";

export const SESSION_COOKIE = "mbk_session";
export const BCRYPT_ROUNDS = 12;
export const REMEMBER_DAYS = 30;
export const SESSION_HOURS = 12;

const PURGE_INTERVAL_MS = 10 * 60 * 1000;
let lastPurgeAt = 0;

export function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(String(password), passwordHash);
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
    role: row.role || "customer",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
  };
}

export function validateNewPassword(newPassword, confirmPassword) {
  const password = String(newPassword || "");
  if (password.length < 8) return "הסיסמה החדשה חייבת להכיל לפחות 8 תווים.";
  if (password.length > 128) return "הסיסמה החדשה ארוכה מדי.";
  if (password !== String(confirmPassword || "")) return "אימות הסיסמה החדשה אינו תואם.";
  return null;
}

export async function findUserByUsername(username, executor = db) {
  const u = normalizeUsername(username);
  if (!u) return null;
  const { rows } = await executor.query(`SELECT * FROM users WHERE username = $1`, [u]);
  return rows[0] || null;
}

export async function findUserById(id, executor = db) {
  const { rows } = await executor.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function purgeExpiredSessions() {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  await db.query(`DELETE FROM user_sessions WHERE expires_at < now()`);
}

export async function createSession(userId, rememberMe, executor = db) {
  const token = createSessionToken();
  const expiresMs = rememberMe
    ? REMEMBER_DAYS * 24 * 60 * 60 * 1000
    : SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiresMs);

  await executor.query(
    `INSERT INTO user_sessions (user_id, token_hash, remember_me, expires_at, last_used_at)
     VALUES ($1, $2, $3, $4, now())`,
    [userId, hashToken(token), rememberMe ? 1 : 0, expiresAt]
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    rememberMe: Boolean(rememberMe),
    maxAgeMs: rememberMe ? expiresMs : null,
  };
}

export async function destroySessionByToken(token) {
  if (!token) return;
  await db.query(`DELETE FROM user_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export async function destroyAllSessionsForUser(userId) {
  await db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
}

export async function getSessionUser(token) {
  if (!token) return null;
  await purgeExpiredSessions();
  const { rows } = await db.query(
    `UPDATE user_sessions s
        SET last_used_at = now()
       FROM users u
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.id = s.user_id
     RETURNING s.id AS session_id, s.expires_at, s.remember_me, u.*`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

export function cookieOptions(rememberMe, maxAgeMs) {
  const sameSite = config.cookieSameSite;
  const secure = config.isProduction || sameSite === "none";

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
