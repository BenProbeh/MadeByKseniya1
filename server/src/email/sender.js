/** Sender identity and address helpers shared by every email provider. */

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const BRAND_NAME = "MadeByKseniya";
const TECHNICAL_SENDER_NAMES = /resend|railway|vercel|noreply|no-reply|microsoft|outlook/i;

/** k***@gmail.com for logs. */
export function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

/** Display name customers see: always the brand, never a provider or a technical name. */
export function brandSenderName(raw) {
  const name = String(raw || "").replace(/["<>\r\n]/g, "").trim();
  return name && !TECHNICAL_SENDER_NAMES.test(name) ? name : BRAND_NAME;
}
