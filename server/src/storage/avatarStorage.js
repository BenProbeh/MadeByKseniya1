/**
 * Avatar storage abstraction — local filesystem for now.
 * Swap implementation later for S3 / Cloudinary / Blob without rewriting profile routes.
 *
 * Production note: Railway ephemeral disk does NOT persist uploads across deploys.
 * Set AVATAR_STORAGE=local for now; wire cloud storage before relying on production avatars.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { uploadsRoot } from "../db.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export function getAllowedMimeTypes() {
  return [...ALLOWED];
}

export function getMaxAvatarBytes() {
  return MAX_BYTES;
}

export async function saveAvatarBuffer(buffer, mime) {
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
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  // Prevent path traversal — only basename under uploadsRoot
  const safeName = path.basename(name);
  const fullPath = path.join(uploadsRoot, safeName);
  if (!fullPath.startsWith(uploadsRoot)) {
    const err = new Error("נתיב לא חוקי");
    err.code = "BAD_PATH";
    throw err;
  }

  await fs.mkdir(uploadsRoot, { recursive: true });
  await fs.writeFile(fullPath, buffer);

  return {
    relativePath: `avatars/${safeName}`,
    publicUrl: `/uploads/avatars/${safeName}`,
    absolutePath: fullPath,
  };
}

export async function deleteAvatarByUrl(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== "string") return;
  const match = avatarUrl.match(/\/uploads\/avatars\/([a-zA-Z0-9._-]+)$/);
  if (!match) return;
  const fullPath = path.join(uploadsRoot, match[1]);
  if (!fullPath.startsWith(uploadsRoot)) return;
  try {
    await fs.unlink(fullPath);
  } catch {
    /* already gone */
  }
}
