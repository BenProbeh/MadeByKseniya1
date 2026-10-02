import { Router } from "express";
import rateLimit from "express-rate-limit";
import { SESSION_COOKIE, cookieOptions, validateNewPassword } from "../auth.js";
import { normalizeEmail } from "../emailAddress.js";
import { isEmailConfigured } from "../email/mailer.js";
import { asyncRoute, sendServiceUnavailable } from "../http.js";
import {
  ACTION_TOKEN_TTL_MINUTES,
  CODE_PURPOSES,
  CODE_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  isActionTokenFormat,
  isCodeFormat,
} from "../emailCodes.js";
import { completePasswordReset, dispatchResetCode, verifyResetCode } from "../passwordReset.js";
import { lockedResponse } from "../codeLimits.js";

export const RESET_MESSAGES = Object.freeze({
  sent: "אם קיים חשבון עם כתובת האימייל הזאת, שלחתי אליו קוד לאיפוס הסיסמה.",
  emailUnavailable: "לא הצלחתי לשלוח את הקוד כרגע. נסי שוב בעוד כמה דקות.",
  codeFormat: "הקוד צריך להכיל 6 ספרות.",
  invalidCode: "הקוד לא נכון או שפג תוקפו. אפשר לבדוק ולנסות שוב, או לבקש קוד חדש.",
  resetExpired: "פג הזמן להשלמת השינוי. אפשר להתחיל שוב ולבקש קוד חדש.",
  done: "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
  tooMany: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.",
});

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ success: false, error: { code, message }, errorMessage: message, ...extra });
}

const ipLimiter = (limit, windowMs) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: RESET_MESSAGES.tooMany } },
  });

const PURPOSE = CODE_PURPOSES.RESET_PASSWORD;

/**
 * POST /request  { email }                       -> always the same answer for any valid address
 * POST /verify   { email, code }                 -> { resetToken } for a correct, live code
 * POST /complete { resetToken, newPassword, confirmPassword }
 * Limits are per IP and per address (hashed), identical for addresses with and without an account.
 */
export function createPasswordResetRouter(limits) {
  const router = Router();

  router.post(
    "/request",
    ipLimiter(10, 60 * 60 * 1000),
    asyncRoute(async (req, res) => {
      if (!isEmailConfigured()) return fail(res, 503, "EMAIL_UNAVAILABLE", RESET_MESSAGES.emailUnavailable);
      const email = normalizeEmail(req.body?.email);
      if (!email.ok) return fail(res, 400, "VALIDATION_ERROR", email.error);

      const limited = limits.takeSend(PURPOSE, email.email);
      if (limited) return fail(res, limited.status, limited.code, limited.message, { retryAfterSeconds: limited.retryAfterSeconds });

      res.json({
        success: true,
        message: RESET_MESSAGES.sent,
        resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
        expiresInSeconds: CODE_TTL_MINUTES * 60,
      });
      dispatchResetCode(email.email);
    })
  );

  router.post(
    "/verify",
    ipLimiter(30, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!email.ok) return fail(res, 400, "VALIDATION_ERROR", email.error);
      const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s+/g, "") : "";
      if (!isCodeFormat(code)) return fail(res, 400, "VALIDATION_ERROR", RESET_MESSAGES.codeFormat);

      const locked = limits.verifyLock(PURPOSE, email.email);
      if (locked) return fail(res, locked.status, locked.code, locked.message, { retryAfterSeconds: locked.retryAfterSeconds, attemptsLeft: 0 });

      try {
        const result = await verifyResetCode(email.email, code);
        if (result.ok) {
          limits.clearFailures(PURPOSE, email.email);
          return res.json({ success: true, resetToken: result.token, expiresInSeconds: ACTION_TOKEN_TTL_MINUTES * 60 });
        }
      } catch (err) {
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        throw err;
      }

      const attemptsLeft = limits.recordFailure(PURPOSE, email.email);
      if (!attemptsLeft) {
        const lock = lockedResponse();
        return fail(res, lock.status, lock.code, lock.message, { retryAfterSeconds: lock.retryAfterSeconds, attemptsLeft });
      }
      return fail(res, 400, "INVALID_CODE", RESET_MESSAGES.invalidCode, { attemptsLeft });
    })
  );

  router.post(
    "/complete",
    ipLimiter(20, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const token = req.body?.resetToken;
      if (!isActionTokenFormat(token)) return fail(res, 400, "RESET_EXPIRED", RESET_MESSAGES.resetExpired);
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";
      const problem = validateNewPassword(newPassword, confirmPassword);
      if (problem) return fail(res, 400, "VALIDATION_ERROR", problem);

      try {
        const result = await completePasswordReset(token, newPassword);
        if (!result.ok) return fail(res, 400, "RESET_EXPIRED", RESET_MESSAGES.resetExpired);
        res.clearCookie(SESSION_COOKIE, cookieOptions(false, null));
        return res.json({ success: true, message: RESET_MESSAGES.done, email: result.email });
      } catch (err) {
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        console.error("password reset completion failed:", err?.code || "", err?.message);
        return fail(res, 500, "RESET_FAILED", "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע.");
      }
    })
  );

  return router;
}
