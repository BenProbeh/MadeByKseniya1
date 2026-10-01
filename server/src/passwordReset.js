import crypto from "node:crypto";
import { promisify } from "node:util";
import db, { transaction } from "./db.js";
import { config } from "./config.js";
import { hashPassword, hashToken } from "./auth.js";
import { recordAudit } from "./roles.js";
import { maskPhone, sendSms } from "./sms.js";

/**
 * "Forgot password" by SMS: phone -> one-time code -> short-lived reset token -> new password.
 * The code and token exist in plain form only in the SMS / the browser's memory; the database keeps hashes.
 */
export const RESET_CODE_TTL_MINUTES = 10;
export const RESET_TOKEN_TTL_MINUTES = 15;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;
export const VERIFY_LOCK_MINUTES = 15;

const scrypt = promisify(crypto.scrypt);
const CODE_PATTERN = /^\d{6}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const PURGE_INTERVAL_MS = 10 * 60 * 1000;
let lastPurgeAt = 0;

export const isResetCodeFormat = (value) => typeof value === "string" && CODE_PATTERN.test(value);
export const isResetTokenFormat = (value) => typeof value === "string" && TOKEN_PATTERN.test(value);

/** Uniform 6-digit code from the OS CSPRNG. */
export function generateResetCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashResetCode(code) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(code), salt, 32);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function resetCodeMatches(code, stored) {
  const [scheme, salt, key] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(String(code), Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

let dummyHash = null;
/** Spend the same hashing time when there is no code to compare, so timing doesn't reveal accounts. */
async function compareAgainstNothing(code) {
  dummyHash ??= await hashResetCode("000000");
  await resetCodeMatches(code, dummyHash);
}

function siteHost() {
  try {
    return new URL(config.frontendOrigins[0]).host;
  } catch {
    return "";
  }
}

/** The last line lets iPhone/Android offer the code for this site only (origin-bound one-time codes). */
export function resetSmsBody(code) {
  const text = `MadeByKseniya: קוד האימות שלך לשינוי הסיסמה הוא ${code}. הקוד תקף ל־${RESET_CODE_TTL_MINUTES} דקות. אם לא ביקשת שינוי, אפשר להתעלם מההודעה.`;
  const host = siteHost();
  return host ? `${text}\n\n@${host} #${code}` : text;
}

/** Sliding-window counter per key, in memory (keys are hashed phone numbers, never the numbers themselves). */
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

async function purgeOldResets() {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  await db.query(`DELETE FROM password_resets WHERE created_at < now() - interval '1 day'`);
}

/** Creates a code for the account on this phone (if any) and texts it. Every outcome looks the same to the caller. */
async function issueResetCode(phoneE164) {
  await purgeOldResets();
  const { rows } = await db.query(`SELECT id FROM users WHERE phone_e164 = $1 AND deleted_at IS NULL`, [phoneE164]);
  const userId = rows[0]?.id;
  if (!userId) return { sent: false, reason: "no_account" };

  const recent = await db.query(
    `SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [userId]
  );
  if (recent.rows[0].n >= MAX_CODES_PER_HOUR) return { sent: false, reason: "hourly_cap" };

  const code = generateResetCode();
  const codeHash = await hashResetCode(code);
  const resetId = await transaction(async (tx) => {
    await tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    await tx.query(
      `UPDATE password_resets SET invalidated_at = now()
        WHERE user_id = $1 AND used_at IS NULL AND invalidated_at IS NULL`,
      [userId]
    );
    const inserted = await tx.query(
      `INSERT INTO password_resets (user_id, phone_e164, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '${RESET_CODE_TTL_MINUTES} minutes') RETURNING id`,
      [userId, phoneE164, codeHash]
    );
    await recordAudit(tx, { action: "password_reset_requested", targetUserId: userId, details: { channel: "sms" } });
    return inserted.rows[0].id;
  });

  const label = `password-reset req=${crypto.randomBytes(4).toString("hex")}`;
  try {
    const result = await sendSms(phoneE164, resetSmsBody(code), { label });
    console.log(`[sms] ${label} to ${maskPhone(phoneE164)} accepted by ${result.provider} status=${result.status || "-"}${result.id ? ` id=${result.id}` : ""}`);
    return { sent: true };
  } catch (err) {
    await db
      .query(`UPDATE password_resets SET invalidated_at = now() WHERE id = $1 AND used_at IS NULL`, [resetId])
      .catch(() => {});
    console.error(
      `[sms] ${label} to ${maskPhone(phoneE164)} failed at ${new Date().toISOString()}: category=${err?.category || err?.code || "error"} http=${err?.httpStatus ?? "-"} twilio=${err?.providerCode ?? "-"} - ${err?.message}`
    );
    return { sent: false, reason: "send_failed" };
  }
}

const pendingDispatches = new Set();

/** Runs after the HTTP response is sent, so response time is the same whether or not the number has an account. */
export function dispatchResetCode(phoneE164) {
  const job = issueResetCode(phoneE164)
    .catch((err) => {
      console.error(`[password-reset] issuing a code for ${maskPhone(phoneE164)} failed:`, err?.code || "", err?.message);
      return { sent: false, reason: "error" };
    })
    .finally(() => pendingDispatches.delete(job));
  pendingDispatches.add(job);
  return job;
}

/** Tests: wait until background code dispatches have finished. */
export async function settleResetDispatches() {
  while (pendingDispatches.size) await Promise.all([...pendingDispatches]);
}

/**
 * Checks a code for a phone. A code only works for the number it was sent to, only while that number still
 * belongs to the account, once, before it expires and within MAX_CODE_ATTEMPTS tries.
 * Returns { ok: true, token } or { ok: false }.
 */
export async function verifyResetCode(phoneE164, code) {
  return transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT pr.id, pr.code_hash
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
        WHERE pr.phone_e164 = $1
          AND u.phone_e164 = $1
          AND u.deleted_at IS NULL
          AND pr.used_at IS NULL
          AND pr.invalidated_at IS NULL
          AND pr.verified_at IS NULL
          AND pr.expires_at > now()
        ORDER BY pr.created_at DESC
        LIMIT 1
        FOR UPDATE OF pr`,
      [phoneE164]
    );
    const row = rows[0];
    if (!row) {
      await compareAgainstNothing(code);
      return { ok: false };
    }
    if (!(await resetCodeMatches(code, row.code_hash))) {
      await tx.query(
        `UPDATE password_resets
            SET attempt_count = attempt_count + 1,
                invalidated_at = CASE WHEN attempt_count + 1 >= $2 THEN now() ELSE invalidated_at END
          WHERE id = $1`,
        [row.id, MAX_CODE_ATTEMPTS]
      );
      return { ok: false };
    }
    const token = crypto.randomBytes(32).toString("hex");
    await tx.query(
      `UPDATE password_resets
          SET verified_at = now(), reset_token_hash = $2,
              reset_expires_at = now() + interval '${RESET_TOKEN_TTL_MINUTES} minutes'
        WHERE id = $1`,
      [row.id, hashToken(token)]
    );
    return { ok: true, token };
  });
}

const LIVE_TOKEN_SQL = `reset_token_hash = $1 AND used_at IS NULL AND invalidated_at IS NULL
  AND verified_at IS NOT NULL AND reset_expires_at > now()`;

/**
 * Sets the new password for the account that verified the code, consuming the token exactly once,
 * signing out every session and retiring any other pending code. Returns { ok, username }.
 */
export async function completePasswordReset(token, newPassword) {
  const tokenHash = hashToken(token);
  const live = await db.query(`SELECT 1 FROM password_resets WHERE ${LIVE_TOKEN_SQL}`, [tokenHash]);
  if (!live.rows.length) return { ok: false };

  const passwordHash = await hashPassword(newPassword);
  return transaction(async (tx) => {
    const claimed = await tx.query(
      `UPDATE password_resets SET used_at = now() WHERE ${LIVE_TOKEN_SQL} RETURNING id, user_id, phone_e164`,
      [tokenHash]
    );
    const reset = claimed.rows[0];
    if (!reset) return { ok: false };
    const user = await tx.query(
      `SELECT id, username FROM users WHERE id = $1 AND phone_e164 = $2 AND deleted_at IS NULL FOR UPDATE`,
      [reset.user_id, reset.phone_e164]
    );
    if (!user.rows.length) return { ok: false };

    await tx.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, reset.user_id]);
    await tx.query(`DELETE FROM user_sessions WHERE user_id = $1`, [reset.user_id]);
    await tx.query(
      `UPDATE password_resets SET invalidated_at = now()
        WHERE user_id = $1 AND id <> $2 AND used_at IS NULL AND invalidated_at IS NULL`,
      [reset.user_id, reset.id]
    );
    await recordAudit(tx, {
      actorUserId: reset.user_id,
      action: "password_reset_completed",
      targetUserId: reset.user_id,
      details: { channel: "sms" },
    });
    return { ok: true, username: user.rows[0].username };
  });
}
