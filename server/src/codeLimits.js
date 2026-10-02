import { hashToken } from "./auth.js";
import {
  MAX_CODE_ATTEMPTS,
  MAX_CODES_PER_HOUR,
  RESEND_COOLDOWN_SECONDS,
  VERIFY_LOCK_MINUTES,
  createWindowCounter,
} from "./emailCodes.js";

const seconds = (ms) => Math.max(1, Math.ceil(ms / 1000));
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60_000));

export const LIMIT_MESSAGES = Object.freeze({
  resendTooSoon: (s) => `כבר שלחתי קוד לפני רגע. אפשר לבקש קוד חדש בעוד ${s} שניות.`,
  hourlyCap: (m) => `ביקשת הרבה קודים בזמן קצר. אפשר לנסות שוב בעוד ${m} דקות.`,
  verifyLocked: (m) => `היו יותר מדי ניסיונות עם הקוד, אז נעלתי את האימות לכתובת הזו. אפשר לנסות שוב בעוד ${m} דקות.`,
});

/**
 * Per-address limits for sending and checking codes, kept per app instance in memory. Keys are hashes of
 * purpose + address, and every address is limited the same way whether or not it has an account.
 * The database adds a per-account hourly cap that survives restarts (emailCodes.issueCode).
 */
export function createCodeLimits() {
  const cooldown = createWindowCounter({ windowMs: RESEND_COOLDOWN_SECONDS * 1000, limit: 1 });
  const hourly = createWindowCounter({ windowMs: 60 * 60 * 1000, limit: MAX_CODES_PER_HOUR });
  const failures = createWindowCounter({ windowMs: VERIFY_LOCK_MINUTES * 60 * 1000, limit: MAX_CODE_ATTEMPTS });
  const key = (purpose, email) => hashToken(`${purpose}:${email}`);

  return {
    /** Returns null when a code may be sent now (and records it), otherwise { status, code, message, retryAfterSeconds }. */
    takeSend(purpose, email) {
      const k = key(purpose, email);
      const waitMs = cooldown.blockedForMs(k);
      if (waitMs) {
        return { status: 429, code: "RESEND_TOO_SOON", message: LIMIT_MESSAGES.resendTooSoon(seconds(waitMs)), retryAfterSeconds: seconds(waitMs) };
      }
      const capMs = hourly.blockedForMs(k);
      if (capMs) {
        return { status: 429, code: "TOO_MANY_REQUESTS", message: LIMIT_MESSAGES.hourlyCap(minutes(capMs)), retryAfterSeconds: seconds(capMs) };
      }
      cooldown.hit(k);
      hourly.hit(k);
      return null;
    },
    /** Null while the address may still try a code, otherwise the lock details. */
    verifyLock(purpose, email) {
      const lockedMs = failures.blockedForMs(key(purpose, email));
      return lockedMs
        ? { status: 429, code: "CODE_LOCKED", message: LIMIT_MESSAGES.verifyLocked(minutes(lockedMs)), retryAfterSeconds: seconds(lockedMs), attemptsLeft: 0 }
        : null;
    },
    /** Records a wrong code; returns attempts left (0 means now locked). */
    recordFailure(purpose, email) {
      const k = key(purpose, email);
      failures.hit(k);
      return Math.max(0, MAX_CODE_ATTEMPTS - failures.count(k));
    },
    clearFailures(purpose, email) {
      failures.clear(key(purpose, email));
    },
  };
}

export const lockedResponse = () => ({
  status: 429,
  code: "CODE_LOCKED",
  message: LIMIT_MESSAGES.verifyLocked(VERIFY_LOCK_MINUTES),
  retryAfterSeconds: VERIFY_LOCK_MINUTES * 60,
  attemptsLeft: 0,
});
