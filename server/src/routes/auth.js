import { Router } from "express";
import rateLimit from "express-rate-limit";
import db, { transaction } from "../db.js";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySessionByToken,
  findUserByEmail,
  findUserById,
  hashPassword,
  normalizeUsername,
  publicUser,
  validateNewPassword,
  validateRegisterInput,
  verifyAgainstNothing,
  verifyPassword,
} from "../auth.js";
import { optionalAuth, requireAuth } from "../middleware/authMiddleware.js";
import { asyncRoute, sendServiceUnavailable } from "../http.js";
import { recordAudit } from "../roles.js";
import { normalizeEmail } from "../emailAddress.js";
import { CODE_PURPOSES, CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, isCodeFormat } from "../emailCodes.js";
import { isEmailConfigured } from "../email/mailer.js";
import { completeEmailVerification, dispatchAddressInUse, dispatchVerificationCode } from "../emailVerification.js";
import { lockedResponse } from "../codeLimits.js";

export const AUTH_MESSAGES = Object.freeze({
  usernameTaken: "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.",
  invalidCredentials: "האימייל או הסיסמה אינם נכונים.",
  notVerified: "החשבון עדיין ממתין לאימות כתובת האימייל. אפשר לשלוח קוד חדש ולהשלים את האימות.",
  codeSent: "שלחתי קוד אימות לכתובת האימייל שלך. הקוד תקף ל־10 דקות.",
  codeFormat: "הקוד צריך להכיל 6 ספרות.",
  invalidCode: "הקוד לא נכון או שפג תוקפו. אפשר לבדוק ולנסות שוב, או לבקש קוד חדש.",
  emailUnavailable: "לא ניתן לאמת את כתובת האימייל הזאת לחשבון. אם נראה לך שזו טעות, כתבי לי ואבדוק.",
  emailOff: "שליחת המיילים באתר לא זמינה כרגע, אז אי אפשר להשלים הרשמה. אפשר לנסות שוב בעוד כמה דקות.",
  tooMany: "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.",
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
    message: { success: false, error: { code: "RATE_LIMITED", message: AUTH_MESSAGES.tooMany } },
  });

const pendingResponse = (email) => ({
  success: true,
  pendingVerification: true,
  email,
  message: AUTH_MESSAGES.codeSent,
  expiresInSeconds: CODE_TTL_MINUTES * 60,
  resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
});

const isUniqueOn = (err, name) => err?.code === "23505" && new RegExp(name).test(`${err.constraint || ""} ${err.message || ""}`);

/**
 * POST /register            { firstName, lastName, username, email, password, confirmPassword, rememberMe }
 * POST /verify-email        { email, code, rememberMe }  -> activates the account and signs in (sign-up)
 * POST /verify-email/resend { email }                    -> same answer for every address
 * POST /login               { email, password, rememberMe } (accounts without a verified email may still use their username)
 */
export function createAuthRouter(limits) {
  const router = Router();

  router.post(
    "/register",
    ipLimiter(30, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const checked = validateRegisterInput(req.body || {});
      if (!checked.ok) {
        return fail(res, 400, "VALIDATION_ERROR", checked.errors[0] || "יש לבדוק את הפרטים שמילאת ולנסות שוב.");
      }
      if (!isEmailConfigured()) return fail(res, 503, "EMAIL_UNAVAILABLE", AUTH_MESSAGES.emailOff);
      const { firstName, lastName, username, email, password } = checked.data;

      try {
        const usernameTaken = await db.query(
          `SELECT 1 FROM users
            WHERE username = $1 AND NOT (account_status = 'pending_verification' AND lower(email_normalized) = $2)`,
          [username, email]
        );
        if (usernameTaken.rows.length) return fail(res, 409, "USERNAME_TAKEN", AUTH_MESSAGES.usernameTaken);

        const limited = limits.takeSend(CODE_PURPOSES.VERIFY_EMAIL, email);
        if (limited) return fail(res, limited.status, limited.code, limited.message, { retryAfterSeconds: limited.retryAfterSeconds });

        const existing = await findUserByEmail(email);
        if (existing && (existing.account_status === "active" || existing.deleted_at)) {
          // Same answer as a fresh sign-up; the address's owner is told by email instead.
          if (!existing.deleted_at) dispatchAddressInUse({ userId: existing.id, email, firstName: existing.first_name });
          return res.status(202).json(pendingResponse(email));
        }

        const passwordHash = await hashPassword(password);
        const user = await transaction(async (tx) => {
          if (existing) {
            // An unverified sign-up with this address is replaced: only the address's owner can ever activate it.
            const { rows } = await tx.query(
              `UPDATE users
                  SET username = $2, password_hash = $3, first_name = $4, last_name = $5, updated_at = now()
                WHERE id = $1 AND account_status = 'pending_verification'
              RETURNING id, first_name`,
              [existing.id, username, passwordHash, firstName, lastName]
            );
            if (rows.length) return rows[0];
          }
          const { rows } = await tx.query(
            `INSERT INTO users (username, password_hash, first_name, last_name, email, email_normalized, account_status)
             VALUES ($1, $2, $3, $4, $5, $5, 'pending_verification')
             RETURNING id, first_name`,
            [username, passwordHash, firstName, lastName, email]
          );
          await recordAudit(tx, { actorUserId: rows[0].id, action: "account_registered", targetUserId: rows[0].id });
          return rows[0];
        });

        dispatchVerificationCode({ userId: user.id, email, firstName: user.first_name });
        return res.status(202).json(pendingResponse(email));
      } catch (err) {
        if (isUniqueOn(err, "users_email_lower_key")) return res.status(202).json(pendingResponse(email));
        if (isUniqueOn(err, "users_username_key")) return fail(res, 409, "USERNAME_TAKEN", AUTH_MESSAGES.usernameTaken);
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        console.error("register failed:", err?.code || "", err?.message);
        return fail(res, 500, "REGISTRATION_FAILED", "לא הצלחתי ליצור את החשבון כרגע. נסי שוב בעוד רגע.");
      }
    })
  );

  router.post(
    "/verify-email",
    ipLimiter(30, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!email.ok) return fail(res, 400, "VALIDATION_ERROR", email.error);
      const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s+/g, "") : "";
      if (!isCodeFormat(code)) return fail(res, 400, "VALIDATION_ERROR", AUTH_MESSAGES.codeFormat);

      const purpose = CODE_PURPOSES.VERIFY_EMAIL;
      const locked = limits.verifyLock(purpose, email.email);
      if (locked) return fail(res, locked.status, locked.code, locked.message, { retryAfterSeconds: locked.retryAfterSeconds, attemptsLeft: 0 });

      const result = await completeEmailVerification(email.email, code);
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

      // Completing a sign-up signs in; an existing account that changed its address keeps its current session.
      if (result.wasPending) {
        const oldToken = req.cookies?.[SESSION_COOKIE];
        if (oldToken) await destroySessionByToken(oldToken).catch(() => {});
        const rememberMe = Boolean(req.body?.rememberMe);
        const session = await createSession(result.user.id, rememberMe);
        await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [result.user.id]);
        res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));
      }
      return res.json({ success: true, signedIn: result.wasPending, user: publicUser(result.user) });
    })
  );

  router.post(
    "/verify-email/resend",
    ipLimiter(10, 60 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!email.ok) return fail(res, 400, "VALIDATION_ERROR", email.error);
      if (!isEmailConfigured()) return fail(res, 503, "EMAIL_UNAVAILABLE", AUTH_MESSAGES.emailOff);
      const limited = limits.takeSend(CODE_PURPOSES.VERIFY_EMAIL, email.email);
      if (limited) return fail(res, limited.status, limited.code, limited.message, { retryAfterSeconds: limited.retryAfterSeconds });

      res.status(202).json(pendingResponse(email.email));
      const user = await findUserByEmail(email.email).catch(() => null);
      if (user && user.account_status === "pending_verification" && !user.deleted_at) {
        dispatchVerificationCode({ userId: user.id, email: email.email, firstName: user.first_name });
      }
      return undefined;
    })
  );

  router.post(
    "/login",
    ipLimiter(30, 15 * 60 * 1000),
    asyncRoute(async (req, res) => {
      const identifier = String(req.body?.email ?? req.body?.username ?? "").trim();
      const password = String(req.body?.password || "");
      const rememberMe = Boolean(req.body?.rememberMe);
      if (!identifier || !password) return fail(res, 400, "INVALID_CREDENTIALS", AUTH_MESSAGES.invalidCredentials);

      try {
        let row = null;
        if (identifier.includes("@")) {
          const email = normalizeEmail(identifier);
          row = email.ok ? await findUserByEmail(email.email) : null;
        } else {
          // Accounts from before email sign-in keep their username until they verify an address.
          const { rows } = await db.query(`SELECT * FROM users WHERE username = $1 AND NOT email_verified`, [
            normalizeUsername(identifier),
          ]);
          row = rows[0] || null;
        }
        const ok = row && !row.deleted_at ? await verifyPassword(password, row.password_hash) : await verifyAgainstNothing(password);
        if (!ok) return fail(res, 401, "INVALID_CREDENTIALS", AUTH_MESSAGES.invalidCredentials);

        if (row.account_status !== "active") {
          return fail(res, 403, "EMAIL_NOT_VERIFIED", AUTH_MESSAGES.notVerified, { email: row.email });
        }

        const oldToken = req.cookies?.[SESSION_COOKIE];
        if (oldToken) await destroySessionByToken(oldToken);
        const { rows } = await db.query(
          `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
          [row.id]
        );
        const session = await createSession(row.id, rememberMe);
        res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));
        return res.json({ success: true, user: publicUser(rows[0]) });
      } catch (err) {
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        console.error("login failed:", err?.code || "", err?.message);
        return fail(res, 500, "LOGIN_FAILED", "לא הצלחתי להתחבר. נסי שוב.");
      }
    })
  );

  router.post(
    "/logout",
    optionalAuth,
    asyncRoute(async (req, res) => {
      const token = req.cookies?.[SESSION_COOKIE];
      if (token) await destroySessionByToken(token).catch(() => {});
      res.clearCookie(SESSION_COOKIE, cookieOptions(false, null));
      return res.json({ success: true, ok: true });
    })
  );

  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `change-password:${req.user.id}`,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "יותר מדי ניסיונות לשינוי סיסמה. אפשר לנסות שוב בעוד כמה דקות." },
    },
  });

  router.post(
    "/change-password",
    requireAuth,
    passwordLimiter,
    asyncRoute(async (req, res) => {
      const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

      if (!currentPassword) return fail(res, 400, "VALIDATION_ERROR", "יש להזין את הסיסמה הנוכחית.");
      const problem = validateNewPassword(newPassword, confirmPassword);
      if (problem) return fail(res, 400, "VALIDATION_ERROR", problem);
      if (newPassword === currentPassword) return fail(res, 400, "VALIDATION_ERROR", "הסיסמה החדשה זהה לסיסמה הנוכחית.");

      try {
        const row = await findUserById(req.user.id);
        if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
          return fail(res, 400, "INVALID_CURRENT_PASSWORD", "הסיסמה הנוכחית שגויה.");
        }
        const passwordHash = await hashPassword(newPassword);
        const rememberMe = Boolean(req.session?.rememberMe);
        const session = await transaction(async (tx) => {
          await tx.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, row.id]);
          await tx.query(`DELETE FROM user_sessions WHERE user_id = $1`, [row.id]);
          const fresh = await createSession(row.id, rememberMe, tx);
          await recordAudit(tx, { actorUserId: row.id, action: "password_changed", targetUserId: row.id });
          return fresh;
        });
        res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));
        return res.json({ success: true, message: "הסיסמה עודכנה. שאר המכשירים שהיו מחוברים נותקו." });
      } catch (err) {
        if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
        console.error("change-password failed:", err?.code || "", err?.message);
        return fail(res, 500, "CHANGE_PASSWORD_FAILED", "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע.");
      }
    })
  );

  router.get("/me", requireAuth, (req, res) => {
    return res.json({ success: true, user: req.user, emailDeliveryReady: isEmailConfigured() });
  });

  return router;
}
