import { Resend } from "resend";
import db from "../db.js";
import { config } from "../config.js";
import { EMAIL_RE, brandSenderName, maskEmail } from "./sender.js";
import { isMicrosoftConnected, microsoftConnection, microsoftSettings, sendViaMicrosoft } from "./microsoft.js";

/**
 * Outgoing email behind one interface: Outlook (Microsoft Graph) or Resend in production, an in-memory outbox in
 * tests. Exactly one provider is active at a time (MAIL_PROVIDER), so a message can't go out twice.
 * Every send is recorded in email_deliveries (type, recipient, provider id, status) — never the content.
 * A missing provider means email is off: the send is recorded as failed, never reported as a success.
 */

export { maskEmail };

const SEND_TIMEOUT_MS = 15_000;

/** Emails captured by the "memory" provider (tests only). */
export const emailTestOutbox = [];

function senderAddress() {
  const raw = config.resendFromEmail;
  const bracketed = raw.match(/<([^>]+)>/);
  return (bracketed ? bracketed[1] : raw).trim();
}

const senderName = () => brandSenderName(config.resendFromName);

/** The provider chosen in Railway, whether or not it is ready: "microsoft" | "resend" | "memory" | "off". */
export function selectedEmailProvider() {
  const chosen = config.emailProvider;
  if (chosen === "memory") return config.isProduction ? "off" : "memory";
  if (chosen === "off" || chosen === "microsoft") return chosen;
  return "resend";
}

/**
 * Resend settings plus setup problems (variable names only, never values).
 * `warnings` don't stop sending but mean it isn't ready for real customers.
 */
export function emailSettings() {
  const problems = [];
  const warnings = [];
  const key = config.resendApiKey;
  if (!key) problems.push("RESEND_API_KEY is missing");
  else if (!/^re_/.test(key)) problems.push("RESEND_API_KEY should be a Resend API key (starts with re_)");

  const address = senderAddress();
  if (!address) problems.push("RESEND_FROM_EMAIL is missing");
  else if (!EMAIL_RE.test(address)) problems.push("RESEND_FROM_EMAIL should be an email address on the domain verified in Resend");
  else if (/@resend\.dev$/i.test(address)) {
    warnings.push("RESEND_FROM_EMAIL uses resend.dev: Resend only delivers it to the Resend account's own address - verify a domain");
  }
  if (!config.appPublicUrl) problems.push("APP_PUBLIC_URL is missing");
  return { key, from: `${senderName()} <${address}>`, address, problems, warnings };
}

/** Blocking problems and non-blocking warnings of the selected provider, by variable name only (never values). */
function setupIssues() {
  const selected = selectedEmailProvider();
  if (selected === "off") {
    const why = config.emailProvider === "memory" ? "MAIL_PROVIDER=memory is for tests only" : "MAIL_PROVIDER is set to off";
    return { problems: [why], warnings: [] };
  }
  if (selected === "memory") return { problems: [], warnings: [] };
  if (selected === "microsoft") return { problems: microsoftSettings().problems, warnings: [] };
  const { problems, warnings } = emailSettings();
  return { problems, warnings };
}

export function emailSetupProblems() {
  const { problems, warnings } = setupIssues();
  return [...problems, ...warnings];
}

/** The provider that sends right now, or null. Outlook also needs the owner's one-time connection. */
export function activeEmailProvider() {
  const selected = selectedEmailProvider();
  if (selected === "off" || setupIssues().problems.length) return null;
  if (selected === "microsoft") return isMicrosoftConnected() ? "microsoft" : null;
  return selected;
}

export const isEmailConfigured = () => activeEmailProvider() !== null;

/**
 * Public readiness: provider name and whether its variables are present. Not proof that sending works,
 * and never a secret, a token or an address.
 */
export function mailReadiness() {
  const selected = selectedEmailProvider();
  return { mailProvider: selected, configured: selected !== "off" && setupIssues().problems.length === 0 };
}

/** "Name <address>" the selected provider sends as. */
export function senderLine() {
  const selected = selectedEmailProvider();
  if (selected === "microsoft") {
    const s = microsoftSettings();
    return s.fromAddress ? `${s.fromName} <${s.fromAddress}>` : "";
  }
  if (selected === "resend") return senderAddress() ? emailSettings().from : "";
  return "";
}

/** Startup log line for Railway: secret-free. */
export function reportEmailSetup() {
  if (!config.isProduction) return;
  const selected = selectedEmailProvider();
  const problems = emailSetupProblems();
  if (selected === "off") console.error(`[email] sending is off: ${problems.join("; ")}.`);
  else if (selected === "microsoft") {
    if (problems.length) console.error(`[email] Outlook sending is not set up: ${problems.join("; ")}.`);
    else console.log(`[email] Outlook (Microsoft Graph) selected, sender ${maskEmail(microsoftSettings().fromAddress)}.`);
  } else {
    const { problems: missing, warnings } = emailSettings();
    if (missing.length) console.error(`[email] sending is off: ${missing.join("; ")}.`);
    else console.log(`[email] Resend ready (sender ${maskEmail(emailSettings().address)}).`);
    for (const warning of warnings) console.warn(`[email] ${warning}.`);
  }
}

/** After the database is up: whether the Outlook mailbox is connected (secret-free log line). */
export function reportMicrosoftConnection() {
  if (selectedEmailProvider() !== "microsoft") return;
  const current = microsoftConnection();
  if (isMicrosoftConnected()) console.log(`[email] Outlook connected (${maskEmail(current.account)}).`);
  else if (current?.needsReconnect) console.error("[email] Outlook needs to be reconnected by the owner (profile page).");
  else if (current) console.error("[email] the connected Outlook account is not MAIL_FROM_ADDRESS - reconnect it from the profile page.");
  else console.error("[email] Outlook is not connected yet - the owner connects it once from the profile page.");
}

let resendClient = null;
let resendClientKey = "";
export function getResendClient() {
  const { key } = emailSettings();
  if (!key) return null;
  if (!resendClient || resendClientKey !== key) {
    resendClient = new Resend(key);
    resendClientKey = key;
  }
  return resendClient;
}

function withTimeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "timeout" })), SEND_TIMEOUT_MS);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

async function deliver(provider, message, idempotencyKey) {
  if (provider === "memory") {
    emailTestOutbox.push({ ...message, idempotencyKey, at: Date.now() });
    return { id: `memory-${emailTestOutbox.length}` };
  }
  if (provider === "microsoft") return sendViaMicrosoft(message);
  const client = getResendClient();
  const { from } = emailSettings();
  const { data, error } = await withTimeout(
    client.emails.send(
      {
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: "type", value: message.type }],
      },
      idempotencyKey ? { idempotencyKey } : undefined
    )
  );
  if (error) {
    const err = new Error(error.message || "send failed");
    err.code = String(error.name || "provider_error").slice(0, 60);
    err.statusCode = error.statusCode ?? null;
    throw err;
  }
  return { id: data?.id || null };
}

/** Reserves the delivery row. With an idempotency key a second call is skipped (or retried only when asked and failed). */
async function reserveDelivery({ type, to, userId, appointmentId, idempotencyKey, retry, provider }) {
  if (!idempotencyKey) {
    const { rows } = await db.query(
      `INSERT INTO email_deliveries (type, recipient_user_id, recipient_email, appointment_id, provider)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, attempts`,
      [type, userId, to, appointmentId, provider]
    );
    return rows[0];
  }
  const inserted = await db.query(
    `INSERT INTO email_deliveries (type, recipient_user_id, recipient_email, appointment_id, idempotency_key, provider)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id, attempts`,
    [type, userId, to, appointmentId, idempotencyKey, provider]
  );
  if (inserted.rows.length) return inserted.rows[0];
  if (!retry) return null;
  const claimed = await db.query(
    `UPDATE email_deliveries
        SET status = 'queued', attempts = attempts + 1, error_code = NULL, failed_at = NULL,
            recipient_email = $2, provider = $3
      WHERE idempotency_key = $1 AND status = 'failed'
      RETURNING id, attempts`,
    [idempotencyKey, to, provider]
  );
  return claimed.rows[0] || null;
}

/**
 * Sends one email and records the outcome. Never throws for delivery problems: returns
 * { ok: true, id } | { ok: false, reason } | { skipped: true } (same idempotency key already handled).
 */
export async function sendEmail({ type, to, subject, html, text, userId = null, appointmentId = null, idempotencyKey = null, retry = false }) {
  const recipient = String(to || "").trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) return { ok: false, reason: "invalid_recipient" };
  const provider = activeEmailProvider();

  const delivery = await reserveDelivery({ type, to: recipient, userId, appointmentId, idempotencyKey, retry, provider });
  if (!delivery) return { skipped: true };

  if (!provider) {
    await db.query(
      `UPDATE email_deliveries SET status = 'failed', error_code = 'not_configured', failed_at = now() WHERE id = $1`,
      [delivery.id]
    );
    console.error(`[email] ${type} to ${maskEmail(recipient)} not sent: email is not configured`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const providerKey = idempotencyKey ? `${idempotencyKey}:${delivery.attempts}` : null;
    const result = await deliver(provider, { type, to: recipient, subject, html, text }, providerKey);
    await db.query(
      `UPDATE email_deliveries SET status = 'sent', provider_message_id = $2, sent_at = now() WHERE id = $1`,
      [delivery.id, result.id]
    );
    console.log(`[email] ${type} to ${maskEmail(recipient)} accepted by ${provider}${result.id ? ` id=${result.id}` : ""}`);
    return { ok: true, id: result.id };
  } catch (err) {
    const code = String(err?.code || err?.name || "error").slice(0, 60);
    await db
      .query(`UPDATE email_deliveries SET status = 'failed', error_code = $2, failed_at = now() WHERE id = $1`, [delivery.id, code])
      .catch(() => {});
    console.error(
      `[email] ${type} to ${maskEmail(recipient)} failed: ${code}${err?.statusCode ? ` http=${err.statusCode}` : ""}`
    );
    return { ok: false, reason: "send_failed" };
  }
}

const pending = new Set();

/** Runs an email job after the HTTP response; failures are logged, never thrown at the caller. */
export function runEmailJob(label, job) {
  const task = Promise.resolve()
    .then(job)
    .catch((err) => {
      console.error(`[email] ${label} job failed:`, err?.code || "", err?.message);
    })
    .finally(() => pending.delete(task));
  pending.add(task);
  return task;
}

/** Tests: wait until background email jobs have finished. */
export async function settleEmailJobs() {
  while (pending.size) await Promise.all([...pending]);
}

const WEBHOOK_STATUS = {
  "email.delivered": "delivered",
  "email.bounced": "failed",
  "email.failed": "failed",
  "email.complained": "failed",
};

/**
 * Resend webhook (signed with RESEND_WEBHOOK_SECRET): moves a delivery to delivered/failed.
 * Returns { status } for the HTTP reply. Payload content is never logged.
 */
export async function handleResendWebhook(rawBody, headers) {
  const secret = config.resendWebhookSecret;
  const client = getResendClient();
  if (!secret || !client) return { status: 503 };
  let event;
  try {
    event = client.webhooks.verify({
      payload: rawBody,
      headers: {
        id: String(headers["svix-id"] || headers["webhook-id"] || ""),
        timestamp: String(headers["svix-timestamp"] || headers["webhook-timestamp"] || ""),
        signature: String(headers["svix-signature"] || headers["webhook-signature"] || ""),
      },
      webhookSecret: secret,
    });
  } catch {
    return { status: 401 };
  }
  const next = WEBHOOK_STATUS[event?.type];
  const messageId = event?.data?.email_id;
  if (!next || !messageId) return { status: 200 };
  if (next === "delivered") {
    await db.query(
      `UPDATE email_deliveries SET status = 'delivered', delivered_at = now()
        WHERE provider_message_id = $1 AND status IN ('queued', 'sent')`,
      [messageId]
    );
  } else {
    await db.query(
      `UPDATE email_deliveries SET status = 'failed', error_code = $2, failed_at = now()
        WHERE provider_message_id = $1 AND status <> 'failed'`,
      [messageId, event.type.replace("email.", "")]
    );
  }
  return { status: 200 };
}
