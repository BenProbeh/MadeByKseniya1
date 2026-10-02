const STATUS_CHANGE_ERRORS = Object.freeze({
  NOT_FOUND: [404, "התור לא נמצא."],
  INVALID_STATUS: [400, "סטטוס לא חוקי."],
  ALREADY_HANDLED: [409, "הבקשה הזו כבר טופלה."],
  INVALID_TRANSITION: [409, "אי אפשר לבצע את הפעולה הזו על תור במצב הנוכחי."],
  IN_PAST: [409, "מועד התור כבר עבר, אי אפשר לאשר אותו."],
  NOTHING_TO_RESEND: [409, "אין מייל לשלוח שוב לתור במצב הזה."],
  NO_EMAIL: [409, "אין כתובת אימייל מאומתת ללקוחה הזו."],
  ALREADY_SENT: [409, "המייל כבר נשלח. אפשר לשלוח שוב רק אחרי שליחה שנכשלה."],
});

/** Sends the response for a known status-change error; returns false for anything unexpected. */
export function sendStatusChangeError(res, err) {
  const known = STATUS_CHANGE_ERRORS[err?.message];
  if (!known) return false;
  const [status, message] = known;
  res.status(status).json({ success: false, code: err.message, error: message, errorMessage: message });
  return true;
}
