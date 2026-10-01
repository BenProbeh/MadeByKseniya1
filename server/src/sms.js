import { config } from "./config.js";

/**
 * SMS delivery behind one interface. Production uses Twilio's Messages API (the code is generated and checked
 * here, so Twilio Verify is not involved); "console" (local development) and "memory" (tests) never run in
 * production, so a missing provider there means SMS is off — never a fake success.
 */

const TWILIO_TIMEOUT_MS = 10_000;
const DELIVERY_CHECK_DELAY_MS = 20_000;

/** Messages captured by the "memory" provider (tests only). */
export const smsTestOutbox = [];

/** +972501234567 -> +97250***567 for logs. */
export function maskPhone(e164) {
  const s = String(e164 || "");
  return s.length > 8 ? `${s.slice(0, 6)}***${s.slice(-3)}` : "***";
}

const E164 = /^\+[1-9]\d{7,14}$/;
const ALPHANUMERIC_SENDER = /^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/;

/**
 * Twilio settings from the environment plus a list of setup problems (variable names only, never values).
 * A Messaging Service SID is used when present; otherwise the sender in TWILIO_FROM / TWILIO_PHONE_NUMBER.
 * Never both, so Twilio doesn't have to choose.
 */
export function twilioSettings() {
  const accountSid = config.twilioAccountSid;
  const authToken = config.twilioAuthToken;
  let serviceSid = config.twilioMessagingServiceSid;
  let from = config.twilioFrom;
  if (!serviceSid && /^MG/i.test(from)) [serviceSid, from] = [from, ""];

  const problems = [];
  if (!accountSid) problems.push("TWILIO_ACCOUNT_SID is missing");
  else if (!/^AC/.test(accountSid)) problems.push("TWILIO_ACCOUNT_SID should be the Account SID (starts with AC)");
  if (!authToken) problems.push("TWILIO_AUTH_TOKEN is missing");
  if (serviceSid) {
    if (/^VA/i.test(serviceSid)) {
      problems.push("TWILIO_MESSAGING_SERVICE_SID holds a Verify service SID (VA...); it needs a Messaging Service SID (MG...)");
    } else if (!/^MG/.test(serviceSid)) {
      problems.push("TWILIO_MESSAGING_SERVICE_SID should be a Messaging Service SID (starts with MG)");
    }
  } else if (!from) {
    problems.push(
      config.twilioVerifyServiceSid
        ? "TWILIO_MESSAGING_SERVICE_SID is missing (TWILIO_VERIFY_SERVICE_SID is not used: the site sends its own code through a Messaging Service)"
        : "TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM) is missing"
    );
  } else if (!E164.test(from) && !ALPHANUMERIC_SENDER.test(from)) {
    problems.push("TWILIO_FROM should be a Twilio number like +972... or a sender name of up to 11 letters/digits");
  }
  return { accountSid, authToken, serviceSid, from, problems };
}

const twilioWanted = () => {
  const name = config.smsProvider;
  if (name === "twilio") return true;
  return (!name || config.isProduction) && Boolean(config.twilioAccountSid || config.twilioMessagingServiceSid);
};

export function activeSmsProvider() {
  const name = config.smsProvider;
  if (name === "off" || name === "none") return null;
  if (twilioWanted()) return twilioSettings().problems.length ? null : "twilio";
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

/** "ready" | "paused" (recent provider-level failure) | "incomplete" (Twilio values missing or wrong) | "off". */
export function smsStatus() {
  if (activeSmsProvider()) return isSmsHealthy() ? "ready" : "paused";
  const name = config.smsProvider;
  if (name === "off" || name === "none") return "off";
  return twilioWanted() ? "incomplete" : "off";
}

/** What is missing for SMS in production, by variable name only (empty when SMS works or outside production). */
export function smsSetupProblems() {
  if (!config.isProduction || activeSmsProvider()) return [];
  const name = config.smsProvider;
  if (name === "off" || name === "none") return ["SMS_PROVIDER is set to off"];
  return twilioSettings().problems;
}

/** Startup log line for Railway: secret-free. */
export function reportSmsSetup() {
  const problems = smsSetupProblems();
  if (problems.length) console.error(`[sms] password reset by SMS is off: ${problems.join("; ")}.`);
  else if (config.isProduction) console.log(`[sms] provider ready (twilio via ${twilioSettings().serviceSid ? "messaging service" : "sender"}).`);
}

/** Twilio error codes -> [category, fix] for the server log (https://www.twilio.com/docs/api/errors). */
const TWILIO_ERRORS = {
  20003: ["credentials", "authentication failed - check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN"],
  20005: ["account", "the Twilio account is not active (suspended or closed) - check the account and its balance"],
  20404: ["service_sid", "account or messaging service not found - check the SIDs"],
  20429: ["rate_limit", "Twilio is rate-limiting this account"],
  21211: ["recipient", "the recipient number is not valid"],
  21212: ["sender", "TWILIO_FROM is not a valid sender"],
  21408: ["country", "sending to this country is not enabled - turn on Israel in Messaging > Settings > Geo permissions"],
  21606: ["sender", "the sender (TWILIO_FROM) can't send SMS"],
  21608: ["trial", "trial account - it can only send to verified numbers; upgrade the account"],
  21610: ["recipient", "the recipient has opted out (replied STOP)"],
  21612: ["sender", "this sender can't reach the recipient - use an approved alphanumeric sender ID or messaging service"],
  21614: ["recipient", "the recipient number is not a mobile number"],
  21659: ["sender", "TWILIO_FROM is not a number or sender ID on this account"],
  21703: ["sender", "the messaging service has no senders - add one to its Sender Pool"],
  21704: ["sender", "the messaging service's senders can't send this message"],
  21705: ["service_sid", "TWILIO_MESSAGING_SERVICE_SID is not a valid messaging service"],
  30003: ["recipient", "handset unreachable (off or out of coverage)"],
  30004: ["recipient", "message blocked by the recipient or carrier"],
  30005: ["recipient", "unknown or inactive number"],
  30006: ["recipient", "landline or unreachable carrier"],
  30007: ["carrier_filter", "filtered by the carrier - register the alphanumeric sender ID for Israel"],
  30008: ["provider", "unknown delivery error"],
  30032: ["sender", "the sender number is not allowed to send to this destination"],
};
/** Codes that are about one recipient; anything else from the provider pauses SMS for everyone. */
const RECIPIENT_ERRORS = new Set([21211, 21608, 21610, 21614]);

export function describeTwilioError(code, httpStatus) {
  const known = TWILIO_ERRORS[code];
  if (known) return { category: known[0], hint: known[1] };
  if (httpStatus === 429) return { category: "rate_limit", hint: "Twilio is rate-limiting this account" };
  if (httpStatus >= 500 || !httpStatus) return { category: "provider_down", hint: "Twilio is unavailable" };
  return { category: "provider", hint: "" };
}

const authHeader = ({ accountSid, authToken }) =>
  `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

function sendFailure(message, { providerCode = null, httpStatus = null, category }) {
  const err = new Error(message);
  err.code = "SMS_SEND_FAILED";
  err.providerCode = providerCode;
  err.httpStatus = httpStatus;
  err.category = category;
  return err;
}

async function sendViaTwilio(to, body, label) {
  const settings = twilioSettings();
  const params = new URLSearchParams({ To: to, Body: body });
  if (settings.serviceSid) params.set("MessagingServiceSid", settings.serviceSid);
  else params.set("From", settings.from);

  let res;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(settings.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: authHeader(settings), "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
  } catch (cause) {
    providerPausedUntil = Date.now() + PROVIDER_PAUSE_MS;
    throw sendFailure(`twilio unreachable (${cause?.name || "network error"})`, { category: "provider_down" });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const twilioCode = Number(data?.code) || null;
    if (!RECIPIENT_ERRORS.has(twilioCode)) providerPausedUntil = Date.now() + PROVIDER_PAUSE_MS;
    const { category, hint } = describeTwilioError(twilioCode, res.status);
    throw sendFailure(
      `twilio responded ${res.status}${twilioCode ? ` (error ${twilioCode}${hint ? `: ${hint}` : ""})` : ""}`,
      { providerCode: twilioCode, httpStatus: res.status, category }
    );
  }
  providerPausedUntil = 0;
  const id = data?.sid || null;
  if (id && config.isProduction) {
    setTimeout(() => void checkTwilioDelivery(id, label), DELIVERY_CHECK_DELAY_MS).unref();
  }
  return { provider: "twilio", id, status: data?.status || null };
}

/**
 * Looks up a sent message once and logs its delivery status ("queued" alone proves nothing).
 * Logs the message SID, status and error code only.
 */
export async function checkTwilioDelivery(messageSid, label = "sms") {
  const settings = twilioSettings();
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(settings.accountSid)}/Messages/${encodeURIComponent(messageSid)}.json`,
      { headers: { Authorization: authHeader(settings) }, signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS) }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`[sms] ${label} delivery check for ${messageSid} failed: http ${res.status}`);
      return null;
    }
    const code = Number(data?.error_code) || null;
    const status = data?.status || "unknown";
    const problem = code ? describeTwilioError(code, 200) : null;
    const line = `[sms] ${label} message ${messageSid} status=${status}${code ? ` error=${code} category=${problem.category}${problem.hint ? `: ${problem.hint}` : ""}` : ""}`;
    (status === "failed" || status === "undelivered" ? console.error : console.log)(line);
    return { status, errorCode: code };
  } catch (err) {
    console.error(`[sms] ${label} delivery check for ${messageSid} failed: ${err?.name || "error"}`);
    return null;
  }
}

/**
 * Sends one SMS. Throws when no provider is configured or delivery is refused.
 * `label` tags log lines (e.g. "password-reset req=1a2b3c4d"). Never logs the message body in production.
 */
export async function sendSms(to, body, { label = "sms" } = {}) {
  const provider = activeSmsProvider();
  if (provider === "memory") {
    smsTestOutbox.push({ to, body, at: Date.now() });
    return { provider, id: `memory-${smsTestOutbox.length}`, status: "sent" };
  }
  if (provider === "console") {
    console.log(`[sms:dev] to ${maskPhone(to)}: ${body}`);
    return { provider, id: null, status: "sent" };
  }
  if (provider === "twilio") return sendViaTwilio(to, body, label);
  const err = new Error("no SMS provider is configured");
  err.code = "SMS_UNCONFIGURED";
  throw err;
}
