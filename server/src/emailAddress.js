/**
 * Email addresses are compared and stored trimmed and lower-cased (client/src/lib/email.js mirrors this).
 * ASCII addresses only: that's what Resend and the database constraint accept.
 */
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const EMAIL_MESSAGES = Object.freeze({
  empty: "יש להזין כתובת אימייל.",
  invalid: "כתובת האימייל לא נראית תקינה. כדאי לבדוק ולנסות שוב.",
});

export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: EMAIL_MESSAGES.empty };
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (at < 1 || email.length > 254 || local.length > 64 || !LOCAL.test(local) || !DOMAIN.test(domain)) {
    return { ok: false, error: EMAIL_MESSAGES.invalid };
  }
  return { ok: true, email };
}
