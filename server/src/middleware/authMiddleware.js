import { SESSION_COOKIE, getSessionUser, publicUser } from "../auth.js";
import { sendServiceUnavailable } from "../http.js";
import { ROLES, isStaffRole } from "../roles.js";

/** Attach req.user when a valid session cookie exists (optional). Role comes from the users row on every request. */
export async function optionalAuth(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  req.sessionToken = token || null;
  req.user = null;
  req.authError = null;
  if (token) {
    try {
      const row = await getSessionUser(token);
      req.user = row ? publicUser(row) : null;
      req.session = row ? { id: row.session_id, rememberMe: Boolean(row.remember_me) } : null;
    } catch (err) {
      req.authError = err;
    }
  }
  next();
}

// `error` stays a plain string: existing profile screens render it directly.
function sendForbidden(res, message) {
  return res.status(403).json({ success: false, code: "FORBIDDEN", error: message, errorMessage: message });
}

/** Require authenticated session. */
export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (req.authError) {
      if (req.authError.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      return next(req.authError);
    }
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, code: "UNAUTHENTICATED", error: "נדרשת התחברות", errorMessage: "נדרשת התחברות" });
    }
    next();
  });
}

/** Owner or admin. */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isStaffRole(req.user.role)) {
      return sendForbidden(res, "אין לך הרשאה לאזור הניהול.");
    }
    next();
  });
}

/** Site owner only. */
export function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== ROLES.OWNER) {
      return sendForbidden(res, "הפעולה הזו שמורה לבעלים של האתר בלבד.");
    }
    next();
  });
}
