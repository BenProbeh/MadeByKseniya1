import { config } from "./config.js";

/**
 * SMS delivery behind one interface. Production uses Twilio's Messages API; "console" (local development) and
 * "memory" (tests) never run in production, so a missing provider there means SMS is off — never a fake success.
 */

const TWILIO_TIMEOUT_MS = 10_000;

/** Messages captured by the "memory" provider (tests only). */
export const smsTestOutbox = [];

/** +972501234567 -> +97250***567 for logs. */
export function maskPhone(e164) {
  const s = String(e164 || "");
  return s.length > 8 ? `${s.slice(0, 6)}***${s.slice(-3)}` : "***";
}

export function activeSmsProvider() {
  const name = config.smsProvider;
  if (name === "twilio") {
    const ready =
      config.twilioAccountSid && config.twilioAuthToken && (config.twilioFrom || config.twilioMessagingServiceSid);
    return ready ? "twilio" : null;
  }
  if (config.isProduction) return null;
  return name === "console" || name === "memory" ? name : null;
}

export const isSmsConfigured = () => activeSmsProvider() !== null;

/**
 * After a provider-level refusal (bad credentials, Israel not enabled, sender not approved, outage) every request
 * gets "try again in a few minutes" for a while. It applies to all numbers alike, so it reveals nothing about accounts.
 */
const PROVIDER_PAUSE_MS = 5 * 60 * 1000;
let providerPausedUntil = 0;

export const isSmsHealthy = () => Date.now() >= providerPausedUntil;

/** Tests only. */
export function resetSmsHealth() {
  providerPausedUntil = 0;
}

/** "ready" | "paused" (recent provider-level failure) | "incomplete" (twilio chosen, values missing) | "off". */
export function smsStatus() {
  if (activeSmsProvider()) return isSmsHealthy() ? "ready" : "paused";
  return config.smsProvider === "twilio" ? "incomplete" : "off";
}

/** Twilio error codes worth explaining in the server log (https://www.twilio.com/docs/api/errors). */
const TWILIO_HINTS = {
  20003: "authentication failed - check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN",
  20404: "account or messaging service not found - check the SIDs",
  21211: "the recipient number is not valid",
  21408: "sending to this country is not enabled - turn on Israel in Messaging > Settings > Geo permissions",
  21606: "the sender (TWILIO_FROM) can't send SMS",
  21608: "trial account - it can only send to verified numbers; upgrade the account",
  21610: "the recipient has opted out (replied STOP)",
  21612: "this sender can't reach the recipient - use an approved alphanumeric sender ID or messaging service",
  21614: "the recipient number is not a mobile number",
  21659: "TWILIO_FROM is not a number or sender ID on this account",
  21703: "the messaging service has no senders",
};
/** Codes that are about one recipient; anything else from the provider pauses SMS for everyone. */
const RECIPIENT_ERRORS = new Set([21211, 21608, 21610, 21614]);

async function sendViaTwilio(to, body) {
  const sid = config.twilioAccountSid;
  const params = new URLSearchParams({ To: to, Body: body });
  if (config.twilioMessagingServiceSid) params.set("MessagingServiceSid", config.twilioMessagingServiceSid);
  else params.set("From", config.twilioFrom);

  let res;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${config.twilioAuthToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
  } catch (cause) {
    providerPausedUntil = Date.now() + PROVIDER_PAUSE_MS;
    const err = new Error(`twilio unreachable (${cause?.name || "network error"})`);
    err.code = "SMS_SEND_FAILED";
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const twilioCode = Number(data?.code) || null;
    if (!RECIPIENT_ERRORS.has(twilioCode)) providerPausedUntil = Date.now() + PROVIDER_PAUSE_MS;
    const hint = TWILIO_HINTS[twilioCode];
    const err = new Error(`twilio responded ${res.status}${twilioCode ? ` (error ${twilioCode}${hint ? `: ${hint}` : ""})` : ""}`);
    err.code = "SMS_SEND_FAILED";
    err.providerCode = twilioCode;
    throw err;
  }
  providerPausedUntil = 0;
  return { provider: "twilio", id: data?.sid || null };
}

/** Sends one SMS. Throws when no provider is configured or delivery is refused. Never logs the message body in production. */
export async function sendSms(to, body) {
  const provider = activeSmsProvider();
  if (provider === "memory") {
    smsTestOutbox.push({ to, body, at: Date.now() });
    return { provider, id: `memory-${smsTestOutbox.length}` };
  }
  if (provider === "console") {
    console.log(`[sms:dev] to ${maskPhone(to)}: ${body}`);
    return { provider, id: null };
  }
  if (provider === "twilio") return sendViaTwilio(to, body);
  const err = new Error("no SMS provider is configured");
  err.code = "SMS_UNCONFIGURED";
  throw err;
}
