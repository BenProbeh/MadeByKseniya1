import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Same policy as server/src/phone.js (the server re-validates every request):
 * Israeli mobile only, E.164 for identity (+972501234567), national format for display (050-123-4567).
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

/** "tel:+972501234567" for a stored E.164 number, or null when it isn't one. */
export function telHref(e164) {
  return /^\+[1-9]\d{7,14}$/.test(String(e164 || "")) ? `tel:${e164}` : null;
}
