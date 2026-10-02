import db, { transaction } from "./db.js";
import { hashPassword, hashToken } from "./auth.js";
import { recordAudit } from "./roles.js";
import { CODE_PURPOSES, attachActionToken, issueCode, retireLiveCode, verifyCode } from "./emailCodes.js";
import { maskEmail, runEmailJob, sendEmail } from "./email/mailer.js";
import { resetPasswordMessage } from "./email/messages.js";

/**
 * "Forgot password" by email: address -> one-time code -> short-lived reset token -> new password.
 * Only active accounts with a verified address get a code; every caller sees the same answer.
 */

async function issueAndSendResetCode(email) {
  const { rows } = await db.query(
    `SELECT id, first_name FROM users
      WHERE lower(email_normalized) = $1 AND email_verified AND account_status = 'active' AND deleted_at IS NULL`,
    [email]
  );
  const user = rows[0];
  if (!user) return { sent: false, reason: "no_account" };

  const code = await issueCode({ userId: user.id, purpose: CODE_PURPOSES.RESET_PASSWORD, email });
  if (!code) return { sent: false, reason: "hourly_cap" };
  await recordAudit(db, { action: "password_reset_requested", targetUserId: user.id, details: { channel: "email" } });

  const result = await sendEmail({
    type: "reset_password",
    to: email,
    userId: user.id,
    ...resetPasswordMessage({ firstName: user.first_name, code }),
  });
  if (!result.ok) {
    await retireLiveCode(user.id, CODE_PURPOSES.RESET_PASSWORD).catch(() => {});
    return { sent: false, reason: result.reason };
  }
  return { sent: true };
}

/** Runs after the HTTP response, so response time is the same whether or not the address has an account. */
export function dispatchResetCode(email) {
  return runEmailJob(`password-reset for ${maskEmail(email)}`, () => issueAndSendResetCode(email));
}

/** Returns { ok: true, token } for a correct, live reset code, otherwise { ok: false }. */
export async function verifyResetCode(email, code) {
  const result = await verifyCode({
    email,
    purpose: CODE_PURPOSES.RESET_PASSWORD,
    code,
    onMatch: async (tx, row) => {
      const user = await tx.query(
        `SELECT 1 FROM users
          WHERE id = $1 AND lower(email_normalized) = $2 AND email_verified AND account_status = 'active' AND deleted_at IS NULL`,
        [row.user_id, row.email_normalized]
      );
      if (!user.rows.length) return { ok: false, reason: "invalid" };
      return { token: await attachActionToken(tx, row.id) };
    },
  });
  return result.ok ? { ok: true, token: result.token } : { ok: false };
}

const LIVE_TOKEN_SQL = `action_token_hash = $1 AND purpose = 'reset_password' AND used_at IS NULL AND invalidated_at IS NULL
  AND verified_at IS NOT NULL AND action_expires_at > now()`;

/**
 * Sets the new password for the account that verified the code, consuming the token exactly once,
 * signing out every session and retiring any other pending reset code. Returns { ok, email }.
 */
export async function completePasswordReset(token, newPassword) {
  const tokenHash = hashToken(token);
  const live = await db.query(`SELECT 1 FROM email_codes WHERE ${LIVE_TOKEN_SQL}`, [tokenHash]);
  if (!live.rows.length) return { ok: false };

  const passwordHash = await hashPassword(newPassword);
  return transaction(async (tx) => {
    const claimed = await tx.query(
      `UPDATE email_codes SET used_at = now() WHERE ${LIVE_TOKEN_SQL} RETURNING id, user_id, email_normalized`,
      [tokenHash]
    );
    const reset = claimed.rows[0];
    if (!reset) return { ok: false };
    const user = await tx.query(
      `SELECT id, email FROM users
        WHERE id = $1 AND lower(email_normalized) = $2 AND account_status = 'active' AND deleted_at IS NULL
        FOR UPDATE`,
      [reset.user_id, reset.email_normalized]
    );
    if (!user.rows.length) return { ok: false };

    await tx.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, reset.user_id]);
    await tx.query(`DELETE FROM user_sessions WHERE user_id = $1`, [reset.user_id]);
    await tx.query(
      `UPDATE email_codes SET invalidated_at = now()
        WHERE user_id = $1 AND purpose = 'reset_password' AND id <> $2 AND used_at IS NULL AND invalidated_at IS NULL`,
      [reset.user_id, reset.id]
    );
    await recordAudit(tx, {
      actorUserId: reset.user_id,
      action: "password_reset_completed",
      targetUserId: reset.user_id,
      details: { channel: "email" },
    });
    return { ok: true, email: user.rows[0].email };
  });
}
