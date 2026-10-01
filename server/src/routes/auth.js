import { Router } from "express";
import rateLimit from "express-rate-limit";
import db, { transaction } from "../db.js";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySessionByToken,
  findUserById,
  findUserByUsername,
  hashPassword,
  publicUser,
  validateNewPassword,
  validateRegisterInput,
  verifyPassword,
} from "../auth.js";
import { optionalAuth, requireAuth } from "../middleware/authMiddleware.js";
import { asyncRoute, sendServiceUnavailable } from "../http.js";
import { recordAudit } from "../roles.js";
import { notifyDuplicatePhoneSignup } from "../notifications.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.",
    },
  },
});

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
    // Back-compat string for older clients
    errorMessage: message,
  });
}

const USERNAME_TAKEN_MESSAGE = "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.";
// Same wording whoever owns the number: never reveals whose account it is.
const PHONE_UNAVAILABLE_MESSAGE =
  "לא ניתן להשלים את ההרשמה עם מספר הטלפון הזה. אם כבר נרשמת בעבר, אפשר להתחבר לחשבון הקיים או לכתוב לי ואעזור.";

function isPhoneConflict(err) {
  return err?.code === "23505" && /users_phone_e164_key/.test(`${err.constraint || ""} ${err.message || ""}`);
}

async function rejectDuplicatePhone(res, data) {
  try {
    const existing = await db.query(`SELECT id FROM users WHERE phone_e164 = $1`, [data.phoneE164]);
    await notifyDuplicatePhoneSignup(db, {
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      phoneE164: data.phoneE164,
      phoneDisplay: data.phoneDisplay,
      existingUserId: existing.rows[0]?.id || null,
    });
  } catch (err) {
    console.error("duplicate-phone notification failed:", err?.code || "", err?.message);
  }
  return fail(res, 409, "PHONE_UNAVAILABLE", PHONE_UNAVAILABLE_MESSAGE);
}

router.post(
  "/register",
  authLimiter,
  asyncRoute(async (req, res) => {
    const checked = validateRegisterInput(req.body || {});
    if (!checked.ok) {
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        checked.errors[0] || "יש לבדוק את הפרטים שמילאת ולנסות שוב."
      );
    }

    const { firstName, lastName, username, phoneE164, phoneDisplay, password, rememberMe } = checked.data;

    try {
      if (await findUserByUsername(username)) {
        return fail(res, 409, "USERNAME_TAKEN", USERNAME_TAKEN_MESSAGE);
      }
      const phoneTaken = await db.query(`SELECT 1 FROM users WHERE phone_e164 = $1`, [phoneE164]);
      if (phoneTaken.rows.length) return rejectDuplicatePhone(res, checked.data);

      const passwordHash = await hashPassword(password);

      // User row and session are created atomically: no orphan accounts without a session.
      const { row, session } = await transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO users (username, password_hash, first_name, last_name, phone_e164, phone_display, last_login_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           RETURNING *`,
          [username, passwordHash, firstName, lastName, phoneE164, phoneDisplay]
        );
        const created = inserted.rows[0];
        const newSession = await createSession(created.id, rememberMe, tx);
        return { row: created, session: newSession };
      });

      const oldToken = req.cookies?.[SESSION_COOKIE];
      if (oldToken) await destroySessionByToken(oldToken).catch(() => {});

      res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.rememberMe, session.maxAgeMs));
      return res.status(201).json({ success: true, user: publicUser(row) });
    } catch (err) {
      if (isPhoneConflict(err)) return rejectDuplicatePhone(res, checked.data);
      if (err?.code === "23505") {
        return fail(res, 409, "USERNAME_TAKEN", USERNAME_TAKEN_MESSAGE);
      }
      if (err?.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      console.error("register failed:", err?.code || "", err?.message);
      return fail(
        res,
        500,
        "REGISTRATION_FAILED",
        "לא הצלחתי ליצור את החשבון כרגע. נסי שוב בעוד רגע."
      );
    }
  })
);

router.post(
  "/login",
  authLimiter,
  asyncRoute(async (req, res) => {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!username.trim() || !password) {
      return fail(res, 400, "INVALID_CREDENTIALS", "שם המשתמש או הסיסמה אינם נכונים");
    }

    try {
      const row = await findUserByUsername(username);
      const ok = row && !row.deleted_at && (await verifyPassword(password, row.password_hash));
      if (!ok) {
        return fail(res, 401, "INVALID_CREDENTIALS", "שם המשתמש או הסיסמה אינם נכונים");
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
    error: {
      code: "RATE_LIMITED",
      message: "יותר מדי ניסיונות לשינוי סיסמה. אפשר לנסות שוב בעוד כמה דקות.",
    },
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

    if (!currentPassword) {
      return fail(res, 400, "VALIDATION_ERROR", "יש להזין את הסיסמה הנוכחית.");
    }
    const problem = validateNewPassword(newPassword, confirmPassword);
    if (problem) return fail(res, 400, "VALIDATION_ERROR", problem);
    if (newPassword === currentPassword) {
      return fail(res, 400, "VALIDATION_ERROR", "הסיסמה החדשה זהה לסיסמה הנוכחית.");
    }

    try {
      const row = await findUserById(req.user.id);
      if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
        return fail(res, 400, "INVALID_CURRENT_PASSWORD", "הסיסמה הנוכחית שגויה.");
      }

      const passwordHash = await hashPassword(newPassword);
      const rememberMe = Boolean(req.session?.rememberMe);

      const session = await transaction(async (tx) => {
        await tx.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
          passwordHash,
          row.id,
        ]);
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
  return res.json({ success: true, user: req.user });
});

export default router;
