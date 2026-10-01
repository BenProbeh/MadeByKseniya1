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

async function sendViaTwilio(to, body) {
  const sid = config.twilioAccountSid;
  const params = new URLSearchParams({ To: to, Body: body });
  if (config.twilioMessagingServiceSid) params.set("MessagingServiceSid", config.twilioMessagingServiceSid);
  else params.set("From", config.twilioFrom);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${config.twilioAuthToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`twilio responded ${res.status}${data?.code ? ` (error ${data.code})` : ""}`);
    err.code = "SMS_SEND_FAILED";
    throw err;
  }
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
