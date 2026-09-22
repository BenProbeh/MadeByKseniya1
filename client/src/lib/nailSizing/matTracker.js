/**
 * Lightweight Mat create/delete counters for debug leak checks.
 * Production: no-op overhead beyond two numbers.
 */

let created = 0;
let deleted = 0;

export function matCreated(n = 1) {
  created += n;
}

export function matDeleted(n = 1) {
  deleted += n;
}

export function getMatStats() {
  return { created, deleted, leaked: created - deleted };
}

export function resetMatStats() {
  created = 0;
  deleted = 0;
}

/** Track a Mat until finally-safe delete. */
export function trackedDelete(mat) {
  if (!mat) return;
  try {
    mat.delete();
    matDeleted(1);
  } catch {
    /* already deleted */
  }
}
