import { SESSION_COOKIE, getSessionUser, publicUser } from "../auth.js";

/** Attach req.user when a valid session cookie exists (optional). */
export function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    const row = getSessionUser(token);
    req.user = row ? publicUser(row) : null;
    req.sessionToken = token || null;
  } catch {
    req.user = null;
    req.sessionToken = null;
  }
  next();
}

/** Require authenticated session. */
export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: "נדרשת התחברות" });
    }
    next();
  });
}
