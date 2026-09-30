/**
 * Avatar storage — images live in PostgreSQL (user_avatars) so they survive
 * redeploys on hosts with ephemeral disks. Served from /api/uploads/avatars/:name
 * so the same URL works directly and through the Vercel /api proxy.
 */

import crypto from "node:crypto";
import db from "../db.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const PUBLIC_PREFIX = "/api/uploads/avatars/";
const NAME_RE = /^([a-f0-9]{32})\.(jpg|png|webp)$/;

export function getAllowedMimeTypes() {
  return [...ALLOWED];
}

export function getMaxAvatarBytes() {
  return MAX_BYTES;
}

export async function saveAvatarBuffer(buffer, mime, userId, executor = db) {
  if (!ALLOWED.has(mime)) {
    const err = new Error("סוג קובץ לא נתמך");
    err.code = "UNSUPPORTED_MIME";
    throw err;
  }
  if (!buffer || buffer.length === 0) {
    const err = new Error("קובץ ריק");
    err.code = "EMPTY";
    throw err;
  }
  if (buffer.length > MAX_BYTES) {
    const err = new Error("הקובץ גדול מדי");
    err.code = "TOO_LARGE";
    throw err;
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const id = crypto.randomBytes(16).toString("hex");

  await executor.query(`INSERT INTO user_avatars (id, user_id, mime, data) VALUES ($1, $2, $3, $4)`, [
    id,
    userId,
    mime,
    buffer,
  ]);

  return { id, publicUrl: `${PUBLIC_PREFIX}${id}.${ext}` };
}

function idFromUrl(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== "string") return null;
  const name = avatarUrl.split("/").pop() || "";
  const match = name.match(NAME_RE);
  return match ? match[1] : null;
}

export async function deleteAvatarByUrl(avatarUrl, executor = db) {
  const id = idFromUrl(avatarUrl);
  if (!id) return;
  await executor.query(`DELETE FROM user_avatars WHERE id = $1`, [id]);
}

/** Returns { mime, data } or null for a public file name like "<hex>.jpg". */
export async function loadAvatar(name) {
  const match = String(name || "").match(NAME_RE);
  if (!match) return null;
  const { rows } = await db.query(`SELECT mime, data FROM user_avatars WHERE id = $1`, [match[1]]);
  if (!rows[0]) return null;
  return { mime: rows[0].mime, data: Buffer.from(rows[0].data) };
}
