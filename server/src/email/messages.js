import { publicUrl, renderEmail } from "./template.js";

export const CODE_TTL_MINUTES = 10;

const WEEKDAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const greeting = (firstName) => (String(firstName || "").trim() ? `היי ${String(firstName).trim()},` : "היי,");

/** "2026-10-15" -> { weekday: "יום חמישי", date: "15.10.2026" } (studio wall-clock date, no time-zone shift). */
export function formatBookingDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) return { weekday: "", date: String(dateStr || "") };
  const [, y, m, d] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)).getUTCDay();
  return { weekday: `יום ${WEEKDAYS_HE[day]}`, date: `${d}.${m}.${y}` };
}

export const formatPrice = (priceIls) => (priceIls == null || Number.isNaN(Number(priceIls)) ? "" : `₪${Number(priceIls)}`);

export function verifyEmailMessage({ firstName, code }) {
  return renderEmail({
    subject: "קוד האימות שלך ל־MadeByKseniya",
    preheader: `קוד האימות שלך: ${code}`,
    blocks: [
      { type: "p", text: greeting(firstName) },
      { type: "p", text: "כיף שהצטרפת אליי.\nזה קוד האימות שלך:" },
      { type: "code", value: code },
      {
        type: "note",
        text: `הקוד תקף ל־${CODE_TTL_MINUTES} דקות.\nאם לא ביקשת ליצור חשבון, אפשר להתעלם מהמייל הזה.`,
      },
    ],
  });
}

export function resetPasswordMessage({ firstName, code }) {
  return renderEmail({
    subject: "קוד לאיפוס הסיסמה שלך",
    preheader: `קוד האימות שלך: ${code}`,
    blocks: [
      { type: "p", text: greeting(firstName) },
      { type: "p", text: "קיבלתי בקשה לשינוי הסיסמה שלך." },
      { type: "p", text: "קוד האימות שלך הוא:" },
      { type: "code", value: code },
      {
        type: "note",
        text: `הקוד תקף ל־${CODE_TTL_MINUTES} דקות.\nאם לא ביקשת לשנות את הסיסמה, אפשר להתעלם מהמייל הזה.`,
      },
    ],
  });
}

/** Sent to the address's real owner when someone tries to sign up (or link an account) with it. Reveals nothing to the requester. */
export function addressInUseMessage({ firstName }) {
  return renderEmail({
    subject: "ניסיון להשתמש בכתובת האימייל שלך",
    preheader: "כבר יש לך חשבון ב־MadeByKseniya",
    blocks: [
      { type: "p", text: greeting(firstName) },
      {
        type: "p",
        text: "מישהי ניסתה עכשיו ליצור חשבון חדש עם כתובת האימייל הזאת, אבל כבר יש לך חשבון אצלי.\nאפשר פשוט להתחבר עם האימייל והסיסמה, ואם שכחת את הסיסמה — לאפס אותה במסך ההתחברות.",
      },
      { type: "button", label: "להתחברות", url: publicUrl("/login") },
      { type: "note", text: "אם זו לא את, אפשר להתעלם מהמייל הזה. החשבון שלך לא השתנה." },
    ],
  });
}

function bookingRows(appt) {
  const { weekday, date } = formatBookingDate(appt.date);
  return [
    ["התאריך המבוקש", date],
    ["היום בשבוע", weekday],
    ["השעה המבוקשת", appt.time],
    ["השירות / המסלול", appt.serviceLabel],
    ["סכום העסקה", formatPrice(appt.priceIls)],
  ];
}

export function appointmentRequestedMessage({ firstName, appointment }) {
  const name = String(firstName || "").trim();
  return renderEmail({
    subject: "קיבלתי את בקשת התור שלך",
    preheader: "הבקשה ממתינה לאישור — אעדכן אותך בקרוב",
    blocks: [
      { type: "lead", text: `${name ? `היי ${name}` : "היי"}, אל תדאגי.. את כבר רשומה אצלי בלב! כבר אעדכן אותך לגבי התור.` },
      { type: "details", rows: bookingRows(appointment) },
      { type: "p", text: "שימי לב: הבקשה ממתינה לאישור, והתור עוד לא נקבע. אעדכן אותך במייל ברגע שאעבור עליה." },
      { type: "button", label: "הבקשות שלי באתר", url: publicUrl("/profile") },
    ],
  });
}

export function appointmentApprovedMessage({ appointment, confirmUrl }) {
  const { weekday, date } = formatBookingDate(appointment.date);
  return renderEmail({
    subject: "התור שלך אושר",
    preheader: `${weekday}, ${date} · ${appointment.time} — נשאר רק ללחוץ על אישור ההזמנה`,
    blocks: [
      {
        type: "inline",
        items: [
          "בחיים חשוב לקחת החלטות נכונות, זאת אחת מהן. נתראה בתור שלך",
          `${weekday}, ${date}`,
          appointment.time,
          formatPrice(appointment.priceIls),
        ],
        button: { label: "אישור ההזמנה", url: confirmUrl },
      },
      { type: "details", rows: [["השירות / המסלול", appointment.serviceLabel]] },
      {
        type: "note",
        text: `לחיצה על „אישור ההזמנה” מאשרת את התור סופית. אם הכפתור לא נפתח, אפשר להעתיק את הקישור לדפדפן:\n${confirmUrl}`,
      },
    ],
  });
}

export function appointmentRejectedMessage({ firstName }) {
  return renderEmail({
    subject: "עדכון לגבי בקשת התור שלך",
    preheader: "אפשר לבחור זמן אחר באתר",
    blocks: [
      { type: "p", text: greeting(firstName) },
      { type: "p", text: "התאריך או השעה שביקשת לא הסתדרו הפעם.\nאפשר להיכנס לאתר ולבחור זמן אחר שמתאים לך." },
      { type: "button", label: "לבחירת זמן אחר", url: publicUrl("/booking") },
    ],
  });
}

export function appointmentCancelledMessage({ firstName, appointment }) {
  const { weekday, date } = formatBookingDate(appointment.date);
  return renderEmail({
    subject: "התור שלך בוטל",
    preheader: `${weekday}, ${date} · ${appointment.time}`,
    blocks: [
      { type: "p", text: greeting(firstName) },
      { type: "p", text: "רציתי לעדכן שהתור הזה בוטל:" },
      {
        type: "details",
        rows: [
          ["תאריך", `${weekday}, ${date}`],
          ["שעה", appointment.time],
          ["השירות / המסלול", appointment.serviceLabel],
        ],
      },
      { type: "p", text: "אם תרצי לקבוע מועד אחר, אפשר להיכנס לאתר ולבחור זמן שמתאים לך." },
      { type: "button", label: "לקביעת תור", url: publicUrl("/booking") },
    ],
  });
}

export function staffNewRequestMessage({ staffFirstName, appointment }) {
  const { weekday, date } = formatBookingDate(appointment.date);
  return renderEmail({
    subject: "בקשת תור חדשה ממתינה לאישור",
    preheader: `${appointment.clientName} · ${weekday}, ${date} · ${appointment.time}`,
    blocks: [
      { type: "p", text: greeting(staffFirstName) },
      { type: "p", text: "התקבלה בקשת תור חדשה שממתינה לאישור:" },
      {
        type: "details",
        rows: [
          ["שם הלקוחה", appointment.clientName],
          ["אימייל", appointment.email],
          ["תאריך", `${weekday}, ${date}`],
          ["שעה", appointment.time],
          ["השירות / המסלול", appointment.serviceLabel],
          ["סכום", formatPrice(appointment.priceIls)],
        ],
      },
      { type: "button", label: "לניהול התורים", url: publicUrl("/admin/appointments") },
      { type: "note", text: "אישור או דחייה נעשים רק מתוך אזור הניהול, אחרי התחברות." },
    ],
  });
}
