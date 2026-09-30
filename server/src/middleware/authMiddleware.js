import { SESSION_COOKIE, getSessionUser, publicUser } from "../auth.js";
import { sendServiceUnavailable } from "../http.js";

/** Attach req.user when a valid session cookie exists (optional). */
export async function optionalAuth(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  req.sessionToken = token || null;
  req.user = null;
  req.authError = null;
  if (token) {
    try {
      const row = await getSessionUser(token);
      req.user = row ? publicUser(row) : null;
    } catch (err) {
      req.authError = err;
    }
  }
  next();
}

/** Require authenticated session. */
export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (req.authError) {
      if (req.authError.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      return next(req.authError);
    }
    if (!req.user) {
      return res.status(401).json({ error: "נדרשת התחברות" });
    }
    next();
  });
}
