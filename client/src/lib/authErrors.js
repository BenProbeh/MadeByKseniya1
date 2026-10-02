/** Extract a safe Hebrew string from axios / fetch errors (never return objects or HTML). */
export function getApiErrorMessage(err, fallback = "משהו השתבש. נסי שוב.") {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const contentType = String(err?.response?.headers?.["content-type"] || "");

  if (import.meta.env?.DEV && status != null) {
    try {
      // eslint-disable-next-line no-console
      console.warn("[auth-api]", {
        status,
        url: err?.config?.baseURL
          ? `${err.config.baseURL || ""}${err.config.url || ""}`
          : err?.config?.url,
        contentType,
      });
    } catch {
      /* ignore */
    }
  }

  const knownCode = apiErrorCode(err);
  if (knownCode && SERVER_WORDED_CODES.has(knownCode)) {
    const worded = apiErrorText(data);
    if (worded && !looksLikeHtmlOrHttpNoise(worded)) return worded;
  }

  // Vercel / CDN HTML or plain-text 404 bodies must never reach the UI.
  if (
    status === 404 ||
    status === 502 ||
    status === 503 ||
    contentType.includes("text/html") ||
    contentType.includes("text/plain")
  ) {
    return fallback === "משהו השתבש. נסי שוב."
      ? "לא הצלחתי ליצור את החשבון כרגע. נסי שוב בעוד רגע."
      : fallback;
  }

  const code = typeof data?.error === "object" ? data.error?.code : data?.code;

  if (code === "USERNAME_TAKEN") {
    return "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.";
  }
  if (code === "VALIDATION_ERROR") {
    const nested =
      (typeof data?.error === "object" && data.error?.message) ||
      data?.errorMessage;
    if (typeof nested === "string" && nested.trim() && !looksLikeHtmlOrHttpNoise(nested)) {
      return nested;
    }
    return "יש לבדוק את הפרטים שמילאת ולנסות שוב.";
  }
  if (code === "API_UNCONFIGURED" || code === "API_PROXY_FAILED" || code === "REGISTRATION_FAILED") {
    return "לא הצלחתי ליצור את החשבון כרגע. נסי שוב בעוד רגע.";
  }

  const raw = data?.error ?? data?.errorMessage ?? data?.message ?? err?.message;
  let message = "";
  if (typeof raw === "string") message = raw.trim();
  else if (raw && typeof raw === "object" && typeof raw.message === "string") {
    message = raw.message.trim();
  }

  if (!message) return fallback;
  if (looksLikeHtmlOrHttpNoise(message)) {
    return fallback === "משהו השתבש. נסי שוב."
      ? "לא הצלחתי ליצור את החשבון כרגע. נסי שוב בעוד רגע."
      : fallback;
  }
  if (message === "Network Error") {
    return "לא הצלחתי להתחבר לשרת. בדקי את החיבור ונסי שוב.";
  }
  return message;
}

/** Error codes whose server message is written for the customer even on 4xx/5xx statuses. */
const SERVER_WORDED_CODES = new Set([
  "EMAIL_UNAVAILABLE",
  "EMAIL_NOT_VERIFIED",
  "INVALID_CODE",
  "CODE_LOCKED",
  "RESEND_TOO_SOON",
  "TOO_MANY_REQUESTS",
  "RATE_LIMITED",
  "CONFIRM_INVALID",
  "CONFIRM_UNAVAILABLE",
  "CONFIRM_EXPIRED",
]);

/** The error code from either response shape: `{ error: { code } }` or `{ code }`. */
export function apiErrorCode(err) {
  const data = err?.response?.data;
  if (!data || typeof data !== "object") return "";
  const code = typeof data.error === "object" && data.error ? data.error.code : data.code;
  return typeof code === "string" ? code : "";
}

function apiErrorText(data) {
  if (!data || typeof data !== "object") return "";
  const raw = typeof data.error === "object" && data.error ? data.error.message : data.error ?? data.errorMessage;
  return typeof raw === "string" ? raw.trim() : "";
}

function looksLikeHtmlOrHttpNoise(text) {
  const t = String(text).trim();
  if (!t) return true;
  if (/<!doctype|<html|<body|NOT_FOUND|DEPLOYMENT_NOT_FOUND/i.test(t)) return true;
  if (/the page could not be found/i.test(t)) return true;
  if (/^error:\s*\d{3}/i.test(t)) return true;
  // Multi-line CDN / platform error pages
  if (t.includes("\n") && /not found|forbidden|bad gateway/i.test(t)) return true;
  return false;
}

export const USERNAME_LATIN_MESSAGE =
  "שם המשתמש נכתב באותיות באנגלית. כדאי לבדוק שהמקלדת באנגלית ולנסות שוב.";

/** Usernames are ASCII only; a phone left on a Hebrew keyboard otherwise yields a confusing "wrong password". */
export function isLatinUsername(value) {
  return /^[\x21-\x7e]*$/.test(String(value || "").replace(/\s+/g, ""));
}

export function assertUser(user) {
  if (!user || user.id == null || !user.username) {
    const err = new Error("השרת לא החזיר משתמש תקין");
    err.code = "INVALID_USER";
    throw err;
  }
  return user;
}
