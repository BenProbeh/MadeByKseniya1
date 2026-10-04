import crypto from "node:crypto";
import db from "../db.js";
import { config } from "../config.js";
import { EMAIL_RE, brandSenderName, maskEmail } from "./sender.js";

/**
 * Sending from the site's Outlook.com mailbox through Microsoft Graph (delegated OAuth 2.0, authorization code + PKCE).
 * The owner connects the mailbox once from the profile page; the refresh token is stored encrypted in
 * mail_connections and rotated on every refresh. Access tokens live in memory only. Nothing here logs or returns
 * a token, a code or the client secret.
 */

const LOGIN_BASE = "https://login.microsoftonline.com";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Mail.Send"];
export const MICROSOFT_CALLBACK_PATH = "/api/mail/microsoft/callback";
const HTTP_TIMEOUT_MS = 15_000;
const STATE_TTL_MS = 10 * 60 * 1000;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_RE = /^(consumers|common|organizations|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const RECONNECT_ERRORS = new Set(["invalid_grant", "interaction_required", "consent_required", "login_required"]);

let http = (url, init) => fetch(url, init);
/** Tests replace the network with a fake Microsoft. */
export function setMicrosoftHttpForTests(fn) {
  http = fn || ((url, init) => fetch(url, init));
}

let connection = null;
let accessToken = null;
let refreshing = null;

export function resetMicrosoftStateForTests() {
  connection = null;
  accessToken = null;
  refreshing = null;
}

function microsoftError(code, statusCode = null) {
  const err = new Error(code);
  err.code = String(code || "microsoft_error").replace(/[^\w.-]/g, "_").slice(0, 60);
  err.statusCode = statusCode;
  return err;
}

/** Settings plus setup problems (variable names only, never values). */
export function microsoftSettings() {
  const problems = [];
  const clientId = config.microsoftClientId;
  if (!clientId) problems.push("MICROSOFT_CLIENT_ID is missing");
  else if (!GUID_RE.test(clientId)) problems.push("MICROSOFT_CLIENT_ID should be the Application (client) ID from Microsoft Entra");

  const clientSecret = config.microsoftClientSecret;
  if (!clientSecret) problems.push("MICROSOFT_CLIENT_SECRET is missing");
  else if (GUID_RE.test(clientSecret)) {
    problems.push("MICROSOFT_CLIENT_SECRET looks like the Secret ID - copy the secret's Value instead");
  }

  const tenant = config.microsoftTenant;
  if (!TENANT_RE.test(tenant)) problems.push("MICROSOFT_TENANT_ID should be consumers for a personal Outlook account");

  const fromAddress = config.mailFromAddress;
  if (!fromAddress) problems.push("MAIL_FROM_ADDRESS is missing");
  else if (!EMAIL_RE.test(fromAddress)) problems.push("MAIL_FROM_ADDRESS should be the Outlook address the site sends from");

  const appUrl = config.appPublicUrl;
  if (!appUrl) problems.push("APP_PUBLIC_URL is missing");
  else if (config.isProduction && !/^https:\/\//i.test(appUrl)) problems.push("APP_PUBLIC_URL should start with https://");

  return {
    clientId,
    clientSecret,
    tenant,
    fromAddress,
    fromName: brandSenderName(config.mailFromName),
    redirectUri: appUrl ? `${appUrl}${MICROSOFT_CALLBACK_PATH}` : "",
    problems,
  };
}

// --- sealed values (refresh token at rest, OAuth state cookie) ---

function sealKey(purpose) {
  const { clientSecret, clientId } = microsoftSettings();
  return Buffer.from(crypto.hkdfSync("sha256", clientSecret, clientId, `madebykseniya:${purpose}`, 32));
}

export function sealSecret(plain, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(purpose), iv);
  const body = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** The plain value, or null when it was tampered with or sealed under another secret. */
export function openSecret(sealed, purpose) {
  try {
    const raw = Buffer.from(String(sealed || "").replace(/^v1\./, ""), "base64url");
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(purpose), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

const hasScope = (granted, scope) =>
  String(granted || "")
    .split(/\s+/)
    .some((s) => s.toLowerCase().endsWith(scope.toLowerCase()));

// --- Microsoft identity platform ---

async function tokenRequest(params) {
  const s = microsoftSettings();
  let res;
  try {
    res = await http(`${LOGIN_BASE}/${encodeURIComponent(s.tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: s.clientId,
        client_secret: s.clientSecret,
        scope: MICROSOFT_SCOPES.join(" "),
        ...params,
      }).toString(),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (err) {
    throw microsoftError(err?.name === "TimeoutError" ? "microsoft_timeout" : "microsoft_unreachable");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw microsoftError(data.error || `http_${res.status}`, res.status);
  return data;
}

async function graphGetMe(token) {
  let res;
  try {
    res = await http(`${GRAPH_BASE}/me?$select=displayName,mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw microsoftError("microsoft_unreachable");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw microsoftError(graphCode(data, res.status), res.status);
  return {
    address: String(data.mail || data.userPrincipalName || "").trim().toLowerCase(),
    displayName: String(data.displayName || "").trim().slice(0, 200) || null,
  };
}

function graphCode(data, status) {
  const code = String(data?.error?.code || "");
  if (status === 401) return "microsoft_unauthorized";
  if (/SendAsDenied/i.test(code)) return "microsoft_send_as_denied";
  if (status === 403 || /AccessDenied/i.test(code)) return "microsoft_mail_send_denied";
  if (/MailboxNotEnabledForRESTAPI/i.test(code)) return "microsoft_mailbox_not_enabled";
  if (status === 429) return "microsoft_throttled";
  if (status >= 500) return "microsoft_unavailable";
  return code ? `microsoft_${code}` : `microsoft_http_${status}`;
}

// --- connection (one row) ---

function mapRow(row) {
  return {
    account: row.account_address,
    displayName: row.display_name,
    scopes: row.scopes,
    connectedAt: row.connected_at,
    refreshedAt: row.refreshed_at,
    needsReconnect: Boolean(row.needs_reconnect),
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
  };
}

/** Reads the stored connection into memory (startup, after connect/disconnect, owner status). */
export async function loadMicrosoftConnection() {
  const { rows } = await db.query(
    `SELECT account_address, display_name, scopes, connected_at, refreshed_at, needs_reconnect, last_error, last_error_at
       FROM mail_connections WHERE provider = 'microsoft'`
  );
  connection = rows[0] ? mapRow(rows[0]) : null;
  return connection;
}

export const microsoftConnection = () => connection;

/** Connected to the mailbox in MAIL_FROM_ADDRESS and not waiting for the owner to reconnect. */
export function isMicrosoftConnected() {
  return Boolean(connection && !connection.needsReconnect && connection.account === config.mailFromAddress);
}

async function recordError(code, { reconnect = false } = {}) {
  await db
    .query(
      `UPDATE mail_connections
          SET last_error = $1, last_error_at = now(), needs_reconnect = needs_reconnect OR $2
        WHERE provider = 'microsoft'`,
      [code, reconnect]
    )
    .catch(() => {});
  if (connection) {
    connection = { ...connection, lastError: code, lastErrorAt: new Date(), needsReconnect: connection.needsReconnect || reconnect };
  }
  if (reconnect) accessToken = null;
}

export async function disconnectMicrosoft() {
  await db.query(`DELETE FROM mail_connections WHERE provider = 'microsoft'`);
  connection = null;
  accessToken = null;
}

// --- OAuth: authorize + callback ---

/** Microsoft sign-in URL plus the sealed state for an httpOnly cookie (CSRF state + PKCE verifier, bound to the owner). */
export function startMicrosoftAuthorization({ userId, now = Date.now() }) {
  const s = microsoftSettings();
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${LOGIN_BASE}/${encodeURIComponent(s.tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: s.clientId,
    response_type: "code",
    redirect_uri: s.redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    login_hint: s.fromAddress,
  }).toString();
  const cookie = sealSecret(JSON.stringify({ state, verifier, userId, exp: now + STATE_TTL_MS }), "oauth-state");
  return { url: url.toString(), cookie, maxAgeMs: STATE_TTL_MS };
}

/**
 * Finishes the owner's sign-in: checks the state, redeems the code, makes sure the account is MAIL_FROM_ADDRESS and
 * that Mail.Send + offline_access were granted, then stores the encrypted refresh token.
 * Returns { ok: true, account, displayName } | { ok: false, reason }.
 */
export async function completeMicrosoftAuthorization({ code, state, sealedState, userId, now = Date.now() }) {
  let pending = null;
  try {
    pending = JSON.parse(openSecret(sealedState, "oauth-state") || "null");
  } catch {
    pending = null;
  }
  if (!pending || pending.exp < now || pending.userId !== userId || !safeEqual(pending.state, state)) {
    return { ok: false, reason: "expired" };
  }
  if (!code || typeof code !== "string") return { ok: false, reason: "failed" };

  const s = microsoftSettings();
  let tokens;
  try {
    tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: s.redirectUri,
      code_verifier: pending.verifier,
    });
  } catch (err) {
    console.error(`[email] Microsoft sign-in could not be completed: ${err.code}`);
    return { ok: false, reason: /invalid_client|unauthorized_client/.test(err.code) ? "bad_client" : "failed" };
  }
  if (!tokens.refresh_token || !hasScope(tokens.scope, "Mail.Send")) {
    console.error("[email] Microsoft sign-in did not grant Mail.Send with offline access");
    return { ok: false, reason: "missing_permission" };
  }

  let me;
  try {
    me = await graphGetMe(tokens.access_token);
  } catch (err) {
    console.error(`[email] Microsoft profile lookup failed: ${err.code}`);
    return { ok: false, reason: "failed" };
  }
  if (me.address !== s.fromAddress) {
    console.error(`[email] Microsoft sign-in used ${maskEmail(me.address)}, expected ${maskEmail(s.fromAddress)}`);
    return { ok: false, reason: "wrong_account" };
  }

  await db.query(
    `INSERT INTO mail_connections (provider, account_address, display_name, refresh_token_enc, scopes, connected_by, connected_at, refreshed_at)
     VALUES ('microsoft', $1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (provider) DO UPDATE
       SET account_address = EXCLUDED.account_address, display_name = EXCLUDED.display_name,
           refresh_token_enc = EXCLUDED.refresh_token_enc, scopes = EXCLUDED.scopes, connected_by = EXCLUDED.connected_by,
           connected_at = now(), refreshed_at = now(), needs_reconnect = false, last_error = NULL, last_error_at = NULL`,
    [me.address, me.displayName, sealSecret(tokens.refresh_token, "refresh-token"), String(tokens.scope || ""), userId]
  );
  accessToken = { value: tokens.access_token, expiresAt: now + Number(tokens.expires_in || 3600) * 1000 };
  await loadMicrosoftConnection();
  console.log(`[email] Outlook connected (${maskEmail(me.address)})`);
  return { ok: true, account: me.address, displayName: me.displayName };
}

// --- access tokens ---

async function refreshAccessToken() {
  const { rows } = await db.query(
    `SELECT refresh_token_enc, needs_reconnect FROM mail_connections WHERE provider = 'microsoft'`
  );
  const row = rows[0];
  if (!row) throw microsoftError("microsoft_not_connected");
  if (row.needs_reconnect) throw microsoftError("microsoft_reconnect_required");
  const refreshToken = openSecret(row.refresh_token_enc, "refresh-token");
  if (!refreshToken) {
    await recordError("token_unreadable", { reconnect: true });
    throw microsoftError("microsoft_reconnect_required");
  }

  let data;
  try {
    data = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  } catch (err) {
    const reconnect = RECONNECT_ERRORS.has(err.code);
    await recordError(err.code, { reconnect });
    console.error(`[email] Outlook token refresh failed: ${err.code}${reconnect ? " - the owner needs to reconnect Outlook" : ""}`);
    throw reconnect ? microsoftError("microsoft_reconnect_required", err.statusCode) : err;
  }

  const rotated = data.refresh_token && data.refresh_token !== refreshToken ? sealSecret(data.refresh_token, "refresh-token") : null;
  await db.query(
    `UPDATE mail_connections
        SET refresh_token_enc = COALESCE($1, refresh_token_enc), refreshed_at = now(), last_error = NULL, last_error_at = NULL
      WHERE provider = 'microsoft'`,
    [rotated]
  );
  if (connection) connection = { ...connection, refreshedAt: new Date(), lastError: null, lastErrorAt: null };
  accessToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return accessToken.value;
}

/** A valid access token; concurrent callers share one refresh. */
async function getAccessToken({ force = false } = {}) {
  if (!force && accessToken && accessToken.expiresAt - 60_000 > Date.now()) return accessToken.value;
  if (force) accessToken = null;
  if (!refreshing) refreshing = refreshAccessToken().finally(() => (refreshing = null));
  return refreshing;
}

/** Live display name of the connected account (best effort, for the owner's status panel). */
export async function refreshMicrosoftProfile() {
  if (!isMicrosoftConnected()) return connection;
  try {
    const me = await graphGetMe(await getAccessToken());
    if (me.displayName !== connection.displayName) {
      await db.query(`UPDATE mail_connections SET display_name = $1 WHERE provider = 'microsoft'`, [me.displayName]);
      connection = { ...connection, displayName: me.displayName };
    }
  } catch {
    // The status panel still shows the stored values.
  }
  return connection;
}

// --- MIME ---

const CRLF = "\r\n";
const wrap76 = (b64) => b64.replace(/.{1,76}/g, (line) => `${line}${CRLF}`).trimEnd();

/** RFC 2047 encoded words, split on character boundaries so Hebrew never breaks mid-letter. */
export function encodeHeaderWord(text) {
  const value = String(text || "").replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join(`${CRLF} `);
}

function formatAddress(name, address) {
  const clean = String(name || "").replace(/["\\\r\n<>]/g, "").trim();
  if (!clean) return `<${address}>`;
  if (/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$/.test(clean)) return `${clean} <${address}>`;
  if (/^[\x20-\x7e]+$/.test(clean)) return `"${clean}" <${address}>`;
  return `${encodeHeaderWord(clean)} <${address}>`;
}

/** multipart/alternative message (plain text + HTML, UTF-8, base64) as Graph's MIME sendMail expects it. */
export function buildMimeMessage({ fromName, fromAddress, to, subject, html, text, date = new Date() }) {
  const boundary = `mbk-${crypto.randomBytes(12).toString("hex")}`;
  const part = (type, body) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(Buffer.from(String(body || ""), "utf8").toString("base64")),
    ].join(CRLF);
  return [
    `From: ${formatAddress(fromName, fromAddress)}`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderWord(subject)}`,
    `Date: ${date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    part("text/plain", text),
    part("text/html", html),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}

// --- sending ---

async function postSendMail(kind, payload) {
  const send = async (token) => {
    try {
      return await http(`${GRAPH_BASE}/me/sendMail`, {
        method: "POST",
        headers:
          kind === "mime"
            ? { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" }
            : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: kind === "mime" ? Buffer.from(payload, "utf8").toString("base64") : JSON.stringify(payload),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (err) {
      throw microsoftError(err?.name === "TimeoutError" ? "microsoft_timeout" : "microsoft_unreachable");
    }
  };
  let res = await send(await getAccessToken());
  if (res.status === 401) res = await send(await getAccessToken({ force: true }));
  return res;
}

/**
 * Sends one message from MAIL_FROM_ADDRESS. Graph answers 202 with no message id, so the request-id header is kept
 * as the provider reference. Saved to the mailbox's Sent Items.
 */
export async function sendViaMicrosoft({ to, subject, html, text }) {
  const s = microsoftSettings();
  if (s.problems.length) throw microsoftError("microsoft_not_configured");
  if (!connection) throw microsoftError("microsoft_not_connected");
  if (connection.account !== s.fromAddress) throw microsoftError("microsoft_account_mismatch");
  if (connection.needsReconnect) throw microsoftError("microsoft_reconnect_required");

  const mime = buildMimeMessage({ fromName: s.fromName, fromAddress: s.fromAddress, to, subject, html, text });
  let res = await postSendMail("mime", mime);
  if (res.status === 400) {
    // A rejected request was not sent; Graph's JSON form carries the HTML version only.
    const rejected = await res.json().catch(() => ({}));
    console.warn(`[email] Outlook rejected the MIME message (${graphCode(rejected, 400)}); resending as HTML only`);
    res = await postSendMail("json", {
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    });
  }
  if (res.status !== 202) {
    const data = await res.json().catch(() => ({}));
    const code = graphCode(data, res.status);
    await recordError(code);
    throw microsoftError(code, res.status);
  }
  return { id: res.headers.get("request-id") || res.headers.get("client-request-id") || null };
}
