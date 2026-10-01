import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Phone policy: Israeli mobile numbers only (SMS verification needs a mobile line).
 * Identity and uniqueness use E.164 (+972501234567); display uses the national format (050-123-4567).
 * Mobile = 05X + 7 digits. Allocated-range checks are deliberately skipped: they go stale and reject real new numbers.
 * Keep in sync with client/src/lib/phone.js.
 */
const IL_MOBILE_NATIONAL = /^5\d{8}$/;

export const PHONE_MESSAGES = Object.freeze({
  required: "יש להזין מספר טלפון.",
  invalid: "מספר הטלפון לא נראה תקין. אפשר לכתוב למשל 050-1234567.",
  notMobile: "כרגע אפשר להירשם רק עם מספר נייד ישראלי.",
});

function prepare(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  // "972501234567" without "+" would otherwise be read as a national number.
  if (!value.startsWith("+") && digits.startsWith("972")) return `+${digits}`;
  return value;
}

/** Returns { ok, e164, display } or { ok: false, error }. Never throws. */
export function normalizePhone(raw) {
  const value = prepare(raw);
  if (!value) return { ok: false, error: PHONE_MESSAGES.required };
  if (value.length > 32 || /[^\d\s\-+().]/.test(value)) return { ok: false, error: PHONE_MESSAGES.invalid };

  const parsed = parsePhoneNumberFromString(value, "IL");
  if (!parsed || !parsed.isPossible()) return { ok: false, error: PHONE_MESSAGES.invalid };
  if (parsed.countryCallingCode !== "972") return { ok: false, error: PHONE_MESSAGES.notMobile };
  if (!IL_MOBILE_NATIONAL.test(parsed.nationalNumber)) {
    return { ok: false, error: parsed.isValid() ? PHONE_MESSAGES.notMobile : PHONE_MESSAGES.invalid };
  }

  return { ok: true, e164: parsed.number, display: parsed.formatNational() };
}

/** Best effort for legacy free-text phones (appointments, measurements): E.164 or null. */
export function toE164OrNull(raw) {
  const result = normalizePhone(raw);
  return result.ok ? result.e164 : null;
}

/** Friendly display for any stored phone; falls back to the raw digits. */
export function displayPhone(raw) {
  const result = normalizePhone(raw);
  return result.ok ? result.display : String(raw || "") || null;
}
