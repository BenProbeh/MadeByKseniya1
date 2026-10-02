import { recordAudit } from "./roles.js";
import { CODE_PURPOSES, consumeCode, issueCode, retireLiveCode, verifyCode } from "./emailCodes.js";
import { maskEmail, runEmailJob, sendEmail } from "./email/mailer.js";
import { addressInUseMessage, verifyEmailMessage } from "./email/messages.js";

/**
 * Proving an email address: new sign-ups (account 'pending_verification' until the code is entered) and existing
 * accounts adding or changing their address. The address is written to the account only once the code matches.
 */

export function dispatchVerificationCode({ userId, email, firstName }) {
  return runEmailJob(`verify-email for ${maskEmail(email)}`, async () => {
    const code = await issueCode({ userId, purpose: CODE_PURPOSES.VERIFY_EMAIL, email });
    if (!code) return { sent: false, reason: "hourly_cap" };
    const result = await sendEmail({
      type: "verify_email",
      to: email,
      userId,
      ...verifyEmailMessage({ firstName, code }),
    });
    if (!result.ok) await retireLiveCode(userId, CODE_PURPOSES.VERIFY_EMAIL).catch(() => {});
    return { sent: Boolean(result.ok) };
  });
}

/** Tells the address's real owner that someone tried to use it; the requester gets the same answer as anyone. */
export function dispatchAddressInUse({ userId, email, firstName }) {
  return runEmailJob(`address-in-use for ${maskEmail(email)}`, () =>
    sendEmail({ type: "address_in_use", to: email, userId, ...addressInUseMessage({ firstName }) })
  );
}

/**
 * Checks a verify_email code. On success the address becomes the account's verified email and a pending account
 * becomes active. Returns { ok: true, user, wasPending } or { ok: false, reason: "invalid" | "email_unavailable" }.
 */
export async function completeEmailVerification(email, code, { userId = null } = {}) {
  try {
    return await verifyCode({
      email,
      purpose: CODE_PURPOSES.VERIFY_EMAIL,
      code,
      onMatch: async (tx, row) => {
        if (userId && row.user_id !== userId) return { ok: false, reason: "invalid" };
        const current = await tx.query(
          `SELECT id, account_status FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [row.user_id]
        );
        if (!current.rows.length) return { ok: false, reason: "invalid" };
        const taken = await tx.query(`SELECT 1 FROM users WHERE lower(email_normalized) = $1 AND id <> $2`, [
          row.email_normalized,
          row.user_id,
        ]);
        if (taken.rows.length) return { ok: false, reason: "email_unavailable" };

        const updated = await tx.query(
          `UPDATE users
              SET email = $2, email_normalized = $2, email_verified = true, email_verified_at = now(),
                  account_status = 'active', updated_at = now()
            WHERE id = $1
          RETURNING *`,
          [row.user_id, row.email_normalized]
        );
        await consumeCode(tx, row.id);
        const wasPending = current.rows[0].account_status === "pending_verification";
        await recordAudit(tx, {
          actorUserId: row.user_id,
          action: wasPending ? "account_activated" : "email_verified",
          targetUserId: row.user_id,
        });
        return { user: updated.rows[0], wasPending };
      },
    });
  } catch (err) {
    if (err?.code === "23505") return { ok: false, reason: "email_unavailable" };
    throw err;
  }
}
