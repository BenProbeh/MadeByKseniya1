import "dotenv/config";

/**
 * Single place where the server reads environment variables.
 * Getters are evaluated lazily so tests can adjust process.env before startup.
 */
function read(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function originList(...names) {
  return names
    .flatMap((name) => read(name).split(","))
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export const config = {
  get isProduction() {
    return read("NODE_ENV") === "production";
  },
  get port() {
    return Number(read("PORT")) || 4000;
  },
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get databaseSsl() {
    return /^(1|true|require)$/i.test(read("DATABASE_SSL"));
  },
  /** Local development / tests only: embedded Postgres data dir ("memory://" for in-memory). */
  get localDbDir() {
    return read("PGLITE_DIR");
  },
  get frontendOrigins() {
    return originList("FRONTEND_URL", "CORS_ORIGINS");
  },
  get trustProxy() {
    return Number(read("TRUST_PROXY")) || 1;
  },
  /**
   * Browsers reach the API same-site through the Vercel /api proxy, so "lax" works
   * (including iPhone Safari). Set COOKIE_SAMESITE=none only when the browser calls
   * the Railway domain directly via VITE_API_URL.
   */
  get cookieSameSite() {
    const value = read("COOKIE_SAMESITE").toLowerCase();
    if (value === "lax" || value === "strict" || value === "none") return value;
    return "lax";
  },
  /** users.id of the site owner (Railway variable). Only used to assign the owner when none exists yet. */
  get ownerUserId() {
    const raw = read("OWNER_USER_ID");
    return /^\d+$/.test(raw) ? Number(raw) : null;
  },
  /** Existing account made owner when no owner exists and OWNER_USER_ID is unset. Never creates a user. */
  get ownerBootstrapUsername() {
    return read("OWNER_USERNAME") || "benexample";
  },
  get openaiApiKey() {
    return read("OPENAI_API_KEY");
  },
  get openaiModel() {
    return read("OPENAI_MODEL") || "gpt-4o-mini";
  },
  /** "twilio" in production; "console" (prints locally) or "memory" (tests) only outside production. */
  get smsProvider() {
    return read("SMS_PROVIDER").toLowerCase();
  },
  get twilioAccountSid() {
    return read("TWILIO_ACCOUNT_SID");
  },
  get twilioAuthToken() {
    return read("TWILIO_AUTH_TOKEN");
  },
  /** Sender: an approved alphanumeric sender ID (e.g. MadeByKsen) or a Twilio number in E.164. */
  get twilioFrom() {
    return read("TWILIO_FROM");
  },
  /** Optional instead of TWILIO_FROM: a Twilio Messaging Service that holds the sender. */
  get twilioMessagingServiceSid() {
    return read("TWILIO_MESSAGING_SERVICE_SID");
  },
};

/** Log clear, secret-free problems with production configuration. Never throws. */
export function reportConfigProblems() {
  if (!config.isProduction) return;
  if (!config.databaseUrl) {
    console.error("[config] DATABASE_URL is not set - the API cannot reach PostgreSQL.");
  }
  if (config.frontendOrigins.length === 0) {
    console.error("[config] FRONTEND_URL is not set - browser requests from the site will be refused by CORS.");
  }
  if (config.smsProvider !== "twilio") {
    console.warn("[config] SMS_PROVIDER is not 'twilio' - password reset by SMS is turned off.");
  } else if (!config.twilioAccountSid || !config.twilioAuthToken || !(config.twilioFrom || config.twilioMessagingServiceSid)) {
    console.error(
      "[config] Twilio is incomplete - set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID)."
    );
  }
}
