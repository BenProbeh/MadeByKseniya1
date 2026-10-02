import crypto from "node:crypto";
import { promisify } from "node:util";
import db, { transaction } from "./db.js";
import { hashToken } from "./auth.js";
import { CODE_TTL_MINUTES } from "./email/messages.js";

/**
 * One-time email codes, shared by sign-up verification and password reset. Each code carries its purpose,
 * so a sign-up code can never reset a password (and the other way round). Only scrypt hashes of codes and
 * sha256 hashes of follow-up tokens are stored; the plain values exist only in the email and the browser.
 */
export const CODE_PURPOSES = Object.freeze({ VERIFY_EMAIL: "verify_email", RESET_PASSWORD: "reset_password" });
export { CODE_TTL_MINUTES };
export const ACTION_TOKEN_TTL_MINUTES = 15;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;
export const VERIFY_LOCK_MINUTES = 15;

const scrypt = promisify(crypto.scrypt);
const CODE_PATTERN = /^\d{6}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const PURGE_INTERVAL_MS = 10 * 60 * 1000;
let lastPurgeAt = 0;

export const isCodeFormat = (value) => typeof value === "string" && CODE_PATTERN.test(value);
export const isActionTokenFormat = (value) => typeof value === "string" && TOKEN_PATTERN.test(value);

/** Uniform 6-digit code from the OS CSPRNG. */
export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashCode(code) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(code), salt, 32);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function codeMatches(code, stored) {
  const [scheme, salt, key] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(String(code), Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

let dummyHash = null;
/** Spend the same hashing time when there is no code to compare, so timing doesn't reveal accounts. */
async function compareAgainstNothing(code) {
  dummyHash ??= await hashCode("000000");
  await codeMatches(code, dummyHash);
}

/** Sliding-window counter per key, in memory (keys are hashed addresses, never the addresses themselves). */
export function createWindowCounter({ windowMs, limit, maxKeys = 20_000 }) {
  const hits = new Map();
  const live = (key, now) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  };
  return {
    blockedForMs(key, now = Date.now()) {
      const list = live(key, now);
      return list.length >= limit ? list[0] + windowMs - now : 0;
    },
    count(key, now = Date.now()) {
      return live(key, now).length;
    },
    hit(key, now = Date.now()) {
      if (!hits.has(key) && hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      const list = live(key, now);
      list.push(now);
      hits.set(key, list);
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

async function purgeOldCodes() {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  await db.query(`DELETE FROM email_codes WHERE created_at < now() - interval '1 day'`);
}

/**
 * Retires the account's live code for this purpose and stores a new one. Returns the plain code
 * (to be emailed) or null when the account already received MAX_CODES_PER_HOUR codes this hour.
 */
export async function issueCode({ userId, purpose, email }) {
  await purgeOldCodes();
  const code = generateCode();
  const codeHash = await hashCode(code);
  const issued = await transaction(async (tx) => {
    await tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const recent = await tx.query(
      `SELECT count(*)::int AS n FROM email_codes
        WHERE user_id = $1 AND purpose = $2 AND created_at > now() - interval '1 hour'`,
      [userId, purpose]
    );
    if (recent.rows[0].n >= MAX_CODES_PER_HOUR) return false;
    await tx.query(
      `UPDATE email_codes SET invalidated_at = now()
        WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND invalidated_at IS NULL`,
      [userId, purpose]
    );
    await tx.query(
      `INSERT INTO email_codes (user_id, purpose, email_normalized, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
      [userId, purpose, email, codeHash, CODE_TTL_MINUTES]
    );
    return true;
  });
  return issued ? code : null;
}

/** Marks a code unusable (e.g. its email could not be sent). */
export async function retireLiveCode(userId, purpose) {
  await db.query(
    `UPDATE email_codes SET invalidated_at = now()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND invalidated_at IS NULL`,
    [userId, purpose]
  );
}

/**
 * Checks a code sent to `email` for `purpose`. A code works once, before it expires, within MAX_CODE_ATTEMPTS
 * tries, and only for a live (not removed) account. `onMatch(tx, row)` runs in the same transaction as consuming
 * the code and may return { ok: false, reason } to refuse (the code then stays usable).
 * Returns { ok: true, userId, ...extra } or { ok: false, reason }.
 */
export async function verifyCode({ email, purpose, code, onMatch }) {
  return transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT c.id, c.user_id, c.code_hash, c.email_normalized
         FROM email_codes c
         JOIN users u ON u.id = c.user_id
        WHERE c.email_normalized = $1
          AND c.purpose = $2
          AND u.deleted_at IS NULL
          AND c.used_at IS NULL
          AND c.invalidated_at IS NULL
          AND c.verified_at IS NULL
          AND c.expires_at > now()
        ORDER BY c.created_at DESC
        LIMIT 3
        FOR UPDATE OF c`,
      [email, purpose]
    );
    if (!rows.length) {
      await compareAgainstNothing(code);
      return { ok: false, reason: "invalid" };
    }
    let match = null;
    for (const row of rows) {
      if (await codeMatches(code, row.code_hash)) {
        match = row;
        break;
      }
    }
    if (!match) {
      await tx.query(
        `UPDATE email_codes
            SET attempt_count = attempt_count + 1,
                invalidated_at = CASE WHEN attempt_count + 1 >= $2 THEN now() ELSE invalidated_at END
          WHERE id = ANY($1::int[])`,
        [rows.map((r) => r.id), MAX_CODE_ATTEMPTS]
      );
      return { ok: false, reason: "invalid" };
    }
    const extra = onMatch ? await onMatch(tx, match) : {};
    if (extra?.ok === false) return extra;
    return { ok: true, userId: match.user_id, codeId: match.id, ...extra };
  });
}

/** For reset_password: turn a verified code into a short-lived token for the "new password" step. */
export async function attachActionToken(tx, codeId) {
  const token = crypto.randomBytes(32).toString("hex");
  await tx.query(
    `UPDATE email_codes
        SET verified_at = now(), action_token_hash = $2,
            action_expires_at = now() + make_interval(mins => $3)
      WHERE id = $1`,
    [codeId, hashToken(token), ACTION_TOKEN_TTL_MINUTES]
  );
  return token;
}

export async function consumeCode(tx, codeId) {
  await tx.query(`UPDATE email_codes SET verified_at = now(), used_at = now() WHERE id = $1`, [codeId]);
}
