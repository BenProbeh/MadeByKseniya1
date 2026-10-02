import { config } from "../config.js";

/**
 * The one layout every MadeByKseniya email uses: RTL Hebrew, dark card with a violet glow, inline styles only
 * (email clients drop most CSS), no scripts, readable without images, and a plain-text twin for every message.
 *
 * Content is a list of blocks:
 *   { type: "p", text }                      paragraph (supports line breaks)
 *   { type: "lead", text }                   larger emphasised paragraph
 *   { type: "code", value }                  one-time code, large and spaced
 *   { type: "details", rows: [[label, value]] }
 *   { type: "inline", items: [text], button } one row on desktop that wraps naturally on mobile
 *   { type: "button", label, url }
 *   { type: "note", text }                   small muted text
 */

const C = {
  page: "#07040b",
  card: "#140c1f",
  border: "#3d2163",
  text: "#f5effc",
  muted: "#b8a6cf",
  faint: "#8b7aa3",
  violet: "#a63dff",
  violetDeep: "#7a1fd6",
  violetSoft: "#dcc2ff",
  codeBg: "#1e1230",
};
// Single quotes only: this sits inside double-quoted style="" attributes.
const FONT = `'Secular One', Arial, Helvetica, sans-serif`;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const lines = (text) => escapeHtml(text).replace(/\r?\n/g, "<br>");

/** Only http(s) links ever reach an href. */
function safeUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) ? escapeHtml(url) : "#";
}

function buttonHtml({ label, url }, { inline = false } = {}) {
  const link = `<a href="${safeUrl(url)}" target="_blank" rel="noopener" style="display:inline-block;background-color:${C.violet};background-image:linear-gradient(135deg,${C.violet},${C.violetDeep});color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;line-height:20px;text-decoration:none;padding:13px 26px;border-radius:999px;border:1px solid #c58bff;box-shadow:0 0 18px rgba(166,61,255,0.45);mso-padding-alt:0;">${escapeHtml(label)}</a>`;
  if (inline) return link;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;"><tr><td align="right">${link}</td></tr></table>`;
}

function blockHtml(block) {
  switch (block.type) {
    case "lead":
      return `<p style="margin:0 0 18px;font-family:${FONT};font-size:19px;line-height:30px;color:${C.text};">${lines(block.text)}</p>`;
    case "p":
      return `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.text};">${lines(block.text)}</p>`;
    case "note":
      return `<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:21px;color:${C.muted};">${lines(block.text)}</p>`;
    case "code":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td align="center" style="background:${C.codeBg};border:1px solid ${C.border};border-radius:16px;padding:20px 12px;">
<div dir="ltr" style="font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:bold;letter-spacing:10px;color:#ffffff;text-shadow:0 0 14px rgba(166,61,255,0.7);">${escapeHtml(block.value)}</div>
</td></tr></table>`;
    case "details": {
      const rows = block.rows
        .filter(([, value]) => value != null && String(value).trim() !== "")
        .map(
          ([label, value]) => `<tr>
<td style="padding:9px 0;border-bottom:1px solid ${C.border};font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted};white-space:nowrap;vertical-align:top;width:38%;">${escapeHtml(label)}</td>
<td style="padding:9px 12px 9px 0;border-bottom:1px solid ${C.border};font-family:${FONT};font-size:16px;line-height:22px;color:${C.text};vertical-align:top;">${escapeHtml(value)}</td>
</tr>`
        )
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;border-top:1px solid ${C.border};">${rows}</table>`;
    }
    case "inline": {
      const items = block.items
        .filter(Boolean)
        .map(
          (item, i) =>
            `<span class="mbk-inline-item" style="display:inline-block;vertical-align:middle;margin:6px 0 6px 14px;font-family:${FONT};font-size:${i === 0 ? 17 : 16}px;line-height:26px;color:${i === 0 ? C.text : C.violetSoft};">${escapeHtml(item)}</span>`
        )
        .join(`<span class="mbk-inline-sep" style="display:inline-block;vertical-align:middle;margin:6px 0 6px 14px;color:${C.faint};">·</span>`);
      const button = block.button
        ? `<span class="mbk-inline-item" style="display:inline-block;vertical-align:middle;margin:8px 0;">${buttonHtml(block.button, { inline: true })}</span>`
        : "";
      return `<div style="margin:4px 0 14px;text-align:right;">${items}${button}</div>`;
    }
    case "button":
      return buttonHtml(block);
    default:
      return "";
  }
}

function blockText(block) {
  switch (block.type) {
    case "lead":
    case "p":
    case "note":
      return block.text;
    case "code":
      return block.value;
    case "details":
      return block.rows
        .filter(([, value]) => value != null && String(value).trim() !== "")
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n");
    case "inline":
      return [block.items.filter(Boolean).join(" · "), block.button ? `${block.button.label}: ${block.button.url}` : ""]
        .filter(Boolean)
        .join("\n");
    case "button":
      return `${block.label}: ${block.url}`;
    default:
      return "";
  }
}

export function publicUrl(path = "/") {
  const base = config.appPublicUrl;
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : "";
}

/** Returns { subject, html, text } for one message. */
export function renderEmail({ subject, preheader = "", blocks }) {
  const logo = publicUrl("/logo.png");
  const logoHtml = /^https:\/\//.test(logo)
    ? `<img src="${escapeHtml(logo)}" width="150" alt="MadeByKseniya" style="display:block;width:150px;max-width:60%;height:auto;border:0;outline:none;margin:0 auto;">`
    : `<div style="font-family:${FONT};font-size:26px;line-height:32px;color:#ffffff;text-shadow:0 0 14px rgba(166,61,255,0.8);">MadeByKseniya</div>`;
  const body = blocks.map(blockHtml).join("\n");

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Secular+One&display=swap" rel="stylesheet">
<style>
  @media only screen and (max-width: 600px) {
    .mbk-card { padding: 26px 18px !important; border-radius: 16px !important; }
    .mbk-inline-sep { display: none !important; }
    .mbk-inline-item { display: block !important; margin: 4px 0 !important; }
  }
</style>
</head>
<body dir="rtl" style="margin:0;padding:0;background-color:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};background-image:radial-gradient(circle at 50% 0%,rgba(166,61,255,0.28),rgba(7,4,11,0) 60%);">
<tr><td align="center" style="padding:32px 12px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td align="center" style="padding:0 0 22px;">${logoHtml}</td></tr>
<tr><td class="mbk-card" dir="rtl" align="right" style="background-color:${C.card};border:1px solid ${C.border};border-radius:22px;padding:34px 30px;text-align:right;box-shadow:0 0 42px rgba(166,61,255,0.22);font-family:${FONT};color:${C.text};">
${body}
</td></tr>
<tr><td align="center" style="padding:22px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.faint};">MadeByKseniya · סטודיו ציפורניים</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `${blocks.map(blockText).filter(Boolean).join("\n\n")}\n\n— MadeByKseniya`;
  return { subject, html, text };
}
