import { Router } from "express";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { findUserByEmail, publicUser } from "../auth.js";
import { asyncRoute } from "../http.js";
import { normalizeEmail } from "../emailAddress.js";
import { CODE_PURPOSES, CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, isCodeFormat } from "../emailCodes.js";
import { isEmailConfigured } from "../email/mailer.js";
import { completeEmailVerification, dispatchAddressInUse, dispatchVerificationCode } from "../emailVerification.js";
import { lockedResponse } from "../codeLimits.js";
import { AUTH_MESSAGES } from "./auth.js";

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ success: false, code, error: message, ...extra });
}

const userLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `profile-email:${req.user.id}`,
  message: { success: false, code: "RATE_LIMITED", error: AUTH_MESSAGES.tooMany },
});

/**
 * Signed-in accounts add or change their email (accounts from before email sign-in must do this once):
 * POST /         { email }        -> sends a code to the new address (same answer if it belongs to someone else)
 * POST /verify   { email, code }  -> the address becomes the account's verified email
 */
export function createProfileEmailRouter(limits) {
  const router = Router();

  router.post(
    "/",
    requireAuth,
    userLimiter,
    asyncRoute(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!email.ok) return fail(res, 400, "VALIDATION_ERROR", email.error);
      if (!isEmailConfigured()) return fail(res, 503, "EMAIL_UNAVAILABLE", "שליחת המיילים לא זמינה כרגע. אפשר לנסות שוב בעוד כמה דקות.");
      if (req.user.emailVerified && req.user.email === email.email) {
        return fail(res, 400, "SAME_EMAIL", "זו כבר כתובת האימייל המאומתת שלך.");
      }

      const limited = limits.takeSend(CODE_PURPOSES.VERIFY_EMAIL, email.email);
      if (limited) return fail(res, limited.status, limited.code, limited.message, { retryAfterSeconds: limited.retryAfterSeconds });

      const owner = await findUserByEmail(email.email);
      if (owner && owner.id !== req.user.id) {
        if (!owner.deleted_at && owner.account_status === "active") {
          dispatchAddressInUse({ userId: owner.id, email: email.email, firstName: owner.first_name });
        }
      } else {
        dispatchVerificationCode({ userId: req.user.id, email: email.email, firstName: req.user.firstName });
      }
      return res.status(202).json({
        success: true,
        email: email.email,
        message: AUTH_MESSAGES.codeSent,
        expiresInSeconds: CODE_TTL_MINUTES * 60,
        resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
      });
    })
  );

  router.post(
    "/verify",
    requireAuth,
    asyncRoute(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!email.ok) return fail(res, 400, "VALIDATION_ERROR", email.error);
      const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s+/g, "") : "";
      if (!isCodeFormat(code)) return fail(res, 400, "VALIDATION_ERROR", AUTH_MESSAGES.codeFormat);

      const purpose = CODE_PURPOSES.VERIFY_EMAIL;
      const locked = limits.verifyLock(purpose, email.email);
      if (locked) return fail(res, locked.status, locked.code, locked.message, { retryAfterSeconds: locked.retryAfterSeconds, attemptsLeft: 0 });

      const result = await completeEmailVerification(email.email, code, { userId: req.user.id });
      if (!result.ok) {
        if (result.reason === "email_unavailable") return fail(res, 409, "EMAIL_UNAVAILABLE", AUTH_MESSAGES.emailUnavailable);
        const attemptsLeft = limits.recordFailure(purpose, email.email);
        if (!attemptsLeft) {
          const lock = lockedResponse();
          return fail(res, lock.status, lock.code, lock.message, { retryAfterSeconds: lock.retryAfterSeconds, attemptsLeft });
        }
        return fail(res, 400, "INVALID_CODE", AUTH_MESSAGES.invalidCode, { attemptsLeft });
      }
      limits.clearFailures(purpose, email.email);
      const { rows } = await db.query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
      return res.json({ success: true, user: publicUser(rows[0]) });
    })
  );

  return router;
}
