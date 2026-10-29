import dotenv from "dotenv";

// `node --test` never reads the developer's server/.env: a local DATABASE_URL or mail setting can't leak into tests.
export const isTestRun = Boolean(process.env.NODE_TEST_CONTEXT);
if (!isTestRun) dotenv.config();

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
  /** Express "trust proxy": a hop count, false/0 to trust nothing, or a named setting like "loopback". */
  get trustProxy() {
    const raw = read("TRUST_PROXY");
    if (!raw) return 1;
    if (/^(false|no)$/i.test(raw)) return false;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : raw;
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
  /**
   * "microsoft" (Outlook via Microsoft Graph) | "resend" | "off"; "memory" captures emails in-process (tests only,
   * never in production). MAIL_PROVIDER wins over the older EMAIL_PROVIDER name; unset keeps Resend.
   */
  /**
   * EMAIL_VERIFICATION=off (Railway variable) lets sign-up work while no email provider is connected: accounts are
   * active at once with the email marked unverified, and booking doesn't wait for a verified address. Anything
   * else (or unset) keeps verification required. Remove the variable once email sending works.
   */
  get emailVerificationOff() {
    return read("EMAIL_VERIFICATION").toLowerCase() === "off";
  },
  get emailProvider() {
    return (read("MAIL_PROVIDER") || read("EMAIL_PROVIDER")).toLowerCase();
  },
  /** The mailbox the site sends from when MAIL_PROVIDER=microsoft. */
  get mailFromAddress() {
    return read("MAIL_FROM_ADDRESS").toLowerCase();
  },
  get mailFromName() {
    return read("MAIL_FROM_NAME") || "MadeByKseniya";
  },
  /** Microsoft Entra app registration (Application (client) ID and a client secret value). */
  get microsoftClientId() {
    return read("MICROSOFT_CLIENT_ID");
  },
  get microsoftClientSecret() {
    return read("MICROSOFT_CLIENT_SECRET");
  },
  /** "consumers" for a personal Outlook.com account. */
  get microsoftTenant() {
    return read("MICROSOFT_TENANT_ID") || "consumers";
  },
  get resendApiKey() {
    return read("RESEND_API_KEY");
  },
  /** Sender address on a domain verified in Resend, e.g. noreply@madebykseniya.co.il ("Name <addr>" also accepted). */
  get resendFromEmail() {
    return read("RESEND_FROM_EMAIL");
  },
  get resendFromName() {
    return read("RESEND_FROM_NAME") || "MadeByKseniya";
  },
  /** Signing secret of the Resend webhook (delivery status updates). Optional. */
  get resendWebhookSecret() {
    return read("RESEND_WEBHOOK_SECRET");
  },
  /** Public site address used in email links and the email logo; falls back to the first FRONTEND_URL. */
  get appPublicUrl() {
    const explicit = read("APP_PUBLIC_URL").replace(/\/+$/, "");
    return explicit || this.frontendOrigins.find((o) => /^https?:\/\//.test(o)) || "";
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
}
