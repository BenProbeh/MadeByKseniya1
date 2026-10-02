/**
 * "אחר כך" on the add-email screen lasts for this browser tab only. This is a UX choice, never an authority:
 * the server still refuses booking without a verified email.
 */
const KEY = "mbk_email_setup_later";

export function skipEmailSetupForNow(userId) {
  try {
    sessionStorage.setItem(KEY, String(userId));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function emailSetupSkipped(userId) {
  try {
    return sessionStorage.getItem(KEY) === String(userId);
  } catch {
    return false;
  }
}

export function needsEmailSetup(user, emailDeliveryReady) {
  return Boolean(user?.id) && !user.emailVerified && emailDeliveryReady && !emailSetupSkipped(user.id);
}
