import { Router } from "express";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import { config } from "../config.js";
import { asyncRoute } from "../http.js";
import { optionalAuth, requireOwner } from "../middleware/authMiddleware.js";
import { ROLES, recordAudit } from "../roles.js";
import { maskEmail } from "../email/sender.js";
import {
  emailSetupProblems,
  isEmailConfigured,
  mailReadiness,
  selectedEmailProvider,
  senderLine,
  sendEmail,
} from "../email/mailer.js";
import { mailTestMessage } from "../email/messages.js";
import {
  completeMicrosoftAuthorization,
  disconnectMicrosoft,
  isMicrosoftConnected,
  loadMicrosoftConnection,
  microsoftSettings,
  refreshMicrosoftProfile,
  startMicrosoftAuthorization,
} from "../email/microsoft.js";

/**
 * Owner-only management of the site's sending mailbox: status, the one-time Outlook connection (OAuth callback) and a
 * test email that can only go to the owner's own verified address. Never returns a token, a secret or a code.
 */

const STATE_COOKIE = "mbk_ms_oauth";
const STATE_COOKIE_PATH = "/api/mail/microsoft";
const CALLBACK_RESULTS = new Set(["connected", "denied", "wrong_account", "expired", "missing_permission", "bad_client", "failed", "not_configured", "signin_required"]);

function reply(res, status, code, message) {
  return res.status(status).json({ success: false, code, error: message, errorMessage: message });
}

const stateCookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: "lax",
  path: STATE_COOKIE_PATH,
});

function backToProfile(res, result) {
  const outcome = CALLBACK_RESULTS.has(result) ? result : "failed";
  return res.redirect(303, `${config.appPublicUrl || ""}/profile?mail=${outcome}`);
}

const testLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `mail-test:${req.user.id}`,
  message: { success: false, code: "RATE_LIMITED", error: "אפשר לשלוח עד 3 מיילי בדיקה בשעה. כדאי לבדוק קודם את תיבת הדואר (וגם את הספאם)." },
});

const connectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `mail-connect:${req.user?.id || "anon"}`,
  message: { success: false, code: "RATE_LIMITED", error: "יותר מדי ניסיונות חיבור. אפשר לנסות שוב בעוד כמה דקות." },
});

export function createOwnerMailRouter() {
  const router = Router();

  router.get(
    "/status",
    requireOwner,
    asyncRoute(async (_req, res) => {
      const selected = selectedEmailProvider();
      const microsoft = selected === "microsoft" ? microsoftSettings() : null;
      let connection = null;
      if (microsoft && !microsoft.problems.length) {
        await loadMicrosoftConnection();
        connection = await refreshMicrosoftProfile();
      }
      const lastTest = await db.query(
        `SELECT status, error_code, created_at FROM email_deliveries WHERE type = 'mail_test' ORDER BY id DESC LIMIT 1`
      );
      return res.json({
        success: true,
        ...mailReadiness(),
        ready: isEmailConfigured(),
        sender: senderLine(),
        missing: emailSetupProblems(),
        microsoft: microsoft
          ? {
              redirectUri: microsoft.redirectUri,
              connected: isMicrosoftConnected(),
              account: connection?.account || null,
              displayName: connection?.displayName || null,
              needsReconnect: Boolean(connection?.needsReconnect),
              connectedAt: connection?.connectedAt || null,
              refreshedAt: connection?.refreshedAt || null,
              lastError: connection?.lastError || null,
              lastErrorAt: connection?.lastErrorAt || null,
            }
          : null,
        lastTest: lastTest.rows[0]
          ? { status: lastTest.rows[0].status, errorCode: lastTest.rows[0].error_code, at: lastTest.rows[0].created_at }
          : null,
      });
    })
  );

  router.get(
    "/microsoft/connect",
    requireOwner,
    connectLimiter,
    (req, res) => {
      if (selectedEmailProvider() !== "microsoft" || microsoftSettings().problems.length) {
        return backToProfile(res, "not_configured");
      }
      const { url, cookie, maxAgeMs } = startMicrosoftAuthorization({ userId: req.user.id });
      res.cookie(STATE_COOKIE, cookie, { ...stateCookieOptions(), maxAge: maxAgeMs });
      return res.redirect(302, url);
    }
  );

  router.post(
    "/microsoft/disconnect",
    requireOwner,
    connectLimiter,
    asyncRoute(async (req, res) => {
      await disconnectMicrosoft();
      await recordAudit(db, { actorUserId: req.user.id, action: "mail_disconnected", targetUserId: null, details: { provider: "microsoft" } });
      console.log("[email] Outlook disconnected by the owner");
      return res.json({ success: true });
    })
  );

  router.post(
    "/test",
    requireOwner,
    testLimiter,
    asyncRoute(async (req, res) => {
      const { rows } = await db.query(
        `SELECT id, email_normalized, email_verified FROM users WHERE id = $1 AND role = $2 AND deleted_at IS NULL`,
        [req.user.id, ROLES.OWNER]
      );
      const owner = rows[0];
      if (!owner) return reply(res, 403, "FORBIDDEN", "הפעולה הזו שמורה לבעלים של האתר בלבד.");
      if (!owner.email_normalized || !owner.email_verified) {
        return reply(res, 409, "OWNER_EMAIL_MISSING", "בחשבון הבעלים עדיין אין כתובת אימייל מאומתת לשליחת הבדיקה.");
      }
      if (!isEmailConfigured()) {
        return reply(res, 503, "EMAIL_UNAVAILABLE", "שליחת המיילים עוד לא מוכנה. צריך להשלים את ההגדרה ואת חיבור Outlook.");
      }
      const result = await sendEmail({ type: "mail_test", to: owner.email_normalized, userId: owner.id, ...mailTestMessage() });
      if (!result.ok) {
        const failed = await db.query(
          `SELECT error_code FROM email_deliveries WHERE type = 'mail_test' AND recipient_user_id = $1 ORDER BY id DESC LIMIT 1`,
          [owner.id]
        );
        return res.status(502).json({
          success: false,
          code: "SEND_FAILED",
          providerError: failed.rows[0]?.error_code || result.reason,
          error: "Microsoft לא קיבלה את המייל. הפרטים מופיעים בשגיאה האחרונה.",
        });
      }
      return res.json({
        success: true,
        provider: selectedEmailProvider(),
        sender: senderLine(),
        sentTo: maskEmail(owner.email_normalized),
        providerMessageId: result.id || null,
      });
    })
  );

  return router;
}

/** Microsoft redirects the owner's browser here after sign-in and consent. */
export function createMicrosoftCallbackRouter() {
  const router = Router();

  router.get(
    "/callback",
    optionalAuth,
    connectLimiter,
    asyncRoute(async (req, res) => {
      const sealedState = req.cookies?.[STATE_COOKIE];
      res.clearCookie(STATE_COOKIE, stateCookieOptions());
      if (req.user?.role !== ROLES.OWNER) return backToProfile(res, "signin_required");
      if (selectedEmailProvider() !== "microsoft" || microsoftSettings().problems.length) {
        return backToProfile(res, "not_configured");
      }

      const error = typeof req.query.error === "string" ? req.query.error : "";
      if (error) {
        console.error(`[email] Microsoft sign-in returned ${error.replace(/[^\w]/g, "").slice(0, 40)}`);
        return backToProfile(res, error === "access_denied" ? "denied" : "failed");
      }

      const result = await completeMicrosoftAuthorization({
        code: typeof req.query.code === "string" ? req.query.code : "",
        state: typeof req.query.state === "string" ? req.query.state : "",
        sealedState,
        userId: req.user.id,
      });
      if (result.ok) {
        await recordAudit(db, { actorUserId: req.user.id, action: "mail_connected", targetUserId: null, details: { provider: "microsoft" } });
      }
      return backToProfile(res, result.ok ? "connected" : result.reason);
    })
  );

  return router;
}
