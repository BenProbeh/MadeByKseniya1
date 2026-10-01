import { Router } from "express";
import rateLimit from "express-rate-limit";
import { SESSION_COOKIE, cookieOptions, hashToken, validateNewPassword } from "../auth.js";
import { normalizePhone } from "../phone.js";
import { isSmsConfigured } from "../sms.js";
import { asyncRoute, sendServiceUnavailable } from "../http.js";
import {
  MAX_CODE_ATTEMPTS,
  MAX_CODES_PER_HOUR,
  RESEND_COOLDOWN_SECONDS,
  RESET_CODE_TTL_MINUTES,
  RESET_TOKEN_TTL_MINUTES,
  VERIFY_LOCK_MINUTES,
  completePasswordReset,
  createWindowCounter,
  dispatchResetCode,
  isResetCodeFormat,
  isResetTokenFormat,
  verifyResetCode,
} from "../passwordReset.js";

export const RESET_MESSAGES = Object.freeze({
  sent: "אם המספר קיים במערכת, אשלח אליו הודעה עם קוד להמשך.",
  smsUnavailable: "שחזור סיסמה ב־SMS עדיין לא פעיל באתר. אפשר לכתוב לי ואעזור לך להיכנס לחשבון.",
  invalidPhone: "מספר הטלפון לא נראה תקין. אפשר לכתוב נייד ישראלי, למשל 050-1234567.",
  codeFormat: "הקוד צריך להכיל 6 ספרות.",
  invalidCode: "הקוד לא נכון או שפג תוקפו. אפשר לבדוק ולנסות שוב, או לבקש קוד חדש.",
  resetExpired: "פג הזמן להשלמת השינוי. אפשר להתחיל שוב ולבקש קוד חדש.",
  done: "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
  tooMany: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.",
});

const resendTooSoon = (s) => `כבר שלחתי קוד לפני רגע. אפשר לבקש קוד חדש בעוד ${s} שניות.`;
const hourlyCap = (m) => `ביקשת הרבה קודים בזמן קצר. אפשר לנסות שוב בעוד ${m} דקות.`;
const verifyLocked = (m) => `היו יותר מדי ניסיונות עם הקוד, אז נעלתי את האימות למספר הזה. אפשר לנסות שוב בעוד ${m} דקות.`;

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

const phoneFrom = (body) => (typeof body?.phone === "string" ? normalizePhone(body.phone) : { ok: false });
const seconds = (ms) => Math.max(1, Math.ceil(ms / 1000));
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60_000));

/**
 * POST /request  { phone }                       -> always the same answer for any valid number
 * POST /verify   { phone, code }                 -> { resetToken } for a correct, live code
 * POST /complete { resetToken, newPassword, confirmPassword }
 * Limits are per IP (express-rate-limit) and per phone number (hashed, in memory), identical for numbers
 * with and without an account, so the answers never reveal whether a number is registered.
 */
export function createPasswordResetRouter() {
  const router = Router();
  const resendCooldown = createWindowCounter({ windowMs: RESEND_COOLDOWN_SECONDS * 1000, limit: 1 });
  const hourlyRequests = createWindowCounter({ windowMs: 60 * 60 * 1000, limit: MAX_CODES_PER_HOUR });
  const verifyFailures = createWindowCounter({ windowMs: VERIFY_LOCK_MINUTES * 60 * 1000, limit: MAX_CODE_ATTEMPTS });

  router.post(
    "/request",
    ipLimiter(10, 60 * 60 * 1000),
    asyncRoute(async (req, res) => {
      if (!isSmsConfigured()) return fail(res, 503, "SMS_UNAVAILABLE", RESET_MESSAGES.smsUnavailable);
      const phone = phoneFrom(req.body);
      if (!phone.ok) return fail(res, 400, "VALIDATION_ERROR", RESET_MESSAGES.invalidPhone);

      const key = hashToken(phone.e164);
      const cooldownMs = resendCooldown.blockedForMs(key);
      if (cooldownMs) {
        return fail(res, 429, "RESEND_TOO_SOON", resendTooSoon(seconds(cooldownMs)), {
          retryAfterSeconds: seconds(cooldownMs),
        });
      }
      const hourlyMs = hourlyRequests.blockedForMs(key);
      if (hourlyMs) {
        return fail(res, 429, "TOO_MANY_REQUESTS", hourlyCap(minutes(hourlyMs)), { retryAfterSeconds: seconds(hourlyMs) });
      }
      resendCooldown.hit(key);
      hourlyRequests.hit(key);

      res.json({
        success: true,
        message: RESET_MESSAGES.sent,
        resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
        expiresInSeconds: RESET_CODE_TTL_MINUTES * 60,
      });
      dispatchResetCode(phone.e164);
    })
  );

  router.post(
    "/verify",
    ipLimiter(30, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const phone = phoneFrom(req.body);
      if (!phone.ok) return fail(res, 400, "VALIDATION_ERROR", RESET_MESSAGES.invalidPhone);
      const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s+/g, "") : "";
      if (!isResetCodeFormat(code)) return fail(res, 400, "VALIDATION_ERROR", RESET_MESSAGES.codeFormat);

      const key = hashToken(phone.e164);
      const lockedMs = verifyFailures.blockedForMs(key);
      if (lockedMs) {
        return fail(res, 429, "CODE_LOCKED", verifyLocked(minutes(lockedMs)), {
          retryAfterSeconds: seconds(lockedMs),
          attemptsLeft: 0,
        });
      }

      try {
        const result = await verifyResetCode(phone.e164, code);
        if (result.ok) {
          verifyFailures.clear(key);
          return res.json({ success: true, resetToken: result.token, expiresInSeconds: RESET_TOKEN_TTL_MINUTES * 60 });
        }
      } catch (err) {
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        throw err;
      }

      verifyFailures.hit(key);
      const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - verifyFailures.count(key));
      if (!attemptsLeft) {
        return fail(res, 429, "CODE_LOCKED", verifyLocked(VERIFY_LOCK_MINUTES), {
          retryAfterSeconds: VERIFY_LOCK_MINUTES * 60,
          attemptsLeft,
        });
      }
      return fail(res, 400, "INVALID_CODE", RESET_MESSAGES.invalidCode, { attemptsLeft });
    })
  );

  router.post(
    "/complete",
    ipLimiter(20, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const token = req.body?.resetToken;
      if (!isResetTokenFormat(token)) return fail(res, 400, "RESET_EXPIRED", RESET_MESSAGES.resetExpired);
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";
      const problem = validateNewPassword(newPassword, confirmPassword);
      if (problem) return fail(res, 400, "VALIDATION_ERROR", problem);

      try {
        const result = await completePasswordReset(token, newPassword);
        if (!result.ok) return fail(res, 400, "RESET_EXPIRED", RESET_MESSAGES.resetExpired);
        res.clearCookie(SESSION_COOKIE, cookieOptions(false, null));
        return res.json({ success: true, message: RESET_MESSAGES.done, username: result.username });
      } catch (err) {
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        console.error("password reset completion failed:", err?.code || "", err?.message);
        return fail(res, 500, "RESET_FAILED", "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע.");
      }
    })
  );

  return router;
}
