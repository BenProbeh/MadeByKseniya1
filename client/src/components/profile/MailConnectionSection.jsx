import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { disconnectMicrosoftMail, fetchMailStatus, microsoftConnectUrl, sendMailTest } from "../../lib/authApi.js";
import { getApiErrorMessage } from "../../lib/authErrors.js";

const BRAND_NAME = "MadeByKseniya";

const CALLBACK_MESSAGES = {
  connected: { ok: true, text: "תיבת Outlook חוברה בהצלחה. עכשיו אפשר לשלוח מייל בדיקה." },
  denied: { ok: false, text: "ההרשאה לא אושרה ב־Microsoft, אז החיבור לא הושלם." },
  wrong_account: { ok: false, text: "התחברת לחשבון Microsoft אחר. צריך להתחבר עם כתובת השולח שהוגדרה ב־Railway." },
  expired: { ok: false, text: "תוקף ניסיון החיבור פג. אפשר ללחוץ שוב על החיבור." },
  missing_permission: { ok: false, text: "Microsoft לא נתנה הרשאה לשליחת מיילים. צריך לאשר את כל ההרשאות במסך ההסכמה." },
  bad_client: { ok: false, text: "Microsoft לא זיהתה את פרטי האפליקציה. כדאי לבדוק את MICROSOFT_CLIENT_ID ואת MICROSOFT_CLIENT_SECRET ב־Railway." },
  not_configured: { ok: false, text: "הגדרות Microsoft ב־Railway עדיין לא שלמות." },
  signin_required: { ok: false, text: "צריך להיות מחוברים לאתר כבעלים כדי לחבר את התיבה." },
  failed: { ok: false, text: "החיבור ל־Microsoft לא הצליח. אפשר לנסות שוב." },
};

const SEND_ERRORS = {
  microsoft_mail_send_denied: "Microsoft סירבה לשליחה (אין הרשאת Mail.Send). צריך לחבר מחדש ולאשר את ההרשאות.",
  microsoft_send_as_denied: "Microsoft לא מאפשרת לשלוח בשם הכתובת הזאת.",
  microsoft_reconnect_required: "ההרשאה של Microsoft פגה או בוטלה. צריך לחבר את התיבה מחדש.",
  microsoft_unauthorized: "Microsoft לא קיבלה את ההרשאה. צריך לחבר את התיבה מחדש.",
  microsoft_throttled: "Microsoft מגבילה כרגע את קצב השליחה. אפשר לנסות שוב בעוד כמה דקות.",
  microsoft_mailbox_not_enabled: "תיבת הדואר עדיין לא פעילה לשליחה דרך Microsoft Graph.",
};

const formatTime = (value) => (value ? new Date(value).toLocaleString("he-IL") : "");

/** Owner only: the Outlook mailbox the site sends from — connect, test, reconnect. */
export default function MailConnectionSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchMailStatus());
      setLoadError("");
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "לא הצלחתי לטעון את מצב שליחת המיילים."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const result = searchParams.get("mail");
    if (!result) return;
    setMessage(CALLBACK_MESSAGES[result] || CALLBACK_MESSAGES.failed);
    const next = new URLSearchParams(searchParams);
    next.delete("mail");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function onTest() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendMailTest();
      setMessage({
        ok: true,
        text: `Microsoft קיבלה את מייל הבדיקה לשליחה אל ${result.sentTo}. זה עדיין לא אומר שהוא הגיע: צריך לוודא שהוא בתיבה (וגם לבדוק בספאם), שהשולח הוא ${result.sender}, ושהוא מופיע בפריטים שנשלחו של Outlook.`,
      });
    } catch (err) {
      const code = err?.response?.data?.providerError;
      setMessage({
        ok: false,
        text: code ? `${SEND_ERRORS[code] || "השליחה נכשלה."} (קוד: ${code})` : getApiErrorMessage(err, "השליחה נכשלה."),
      });
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function onDisconnect() {
    if (busy || !window.confirm("לנתק את תיבת Outlook? עד החיבור מחדש האתר לא ישלח מיילים.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await disconnectMicrosoftMail();
      setMessage({ ok: true, text: "התיבה נותקה." });
    } catch (err) {
      setMessage({ ok: false, text: getApiErrorMessage(err, "לא הצלחתי לנתק את התיבה.") });
    } finally {
      setBusy(false);
      void load();
    }
  }

  const microsoft = status?.microsoft;
  const missing = status?.missing || [];

  return (
    <div className="space-y-3 text-center sm:text-right">
      <p className="font-serif text-white/80">שליחת מיילים מהאתר</p>

      {loadError && (
        <p className="text-sm text-red-300" role="alert">
          {loadError}
        </p>
      )}

      {status && (
        <div className="space-y-2 text-sm text-white/60">
          {status.sender && (
            <p>
              שולח:{" "}
              <bdi dir="ltr" className="break-all">
                {status.sender}
              </bdi>
            </p>
          )}

          {status.mailProvider !== "microsoft" && (
            <p className="text-white/50">
              כרגע הספק הפעיל הוא {status.mailProvider}. כדי לשלוח מ־Outlook צריך להגדיר ב־Railway את MAIL_PROVIDER=microsoft.
            </p>
          )}

          {missing.length > 0 && (
            <div className="text-amber-200">
              <p>חסרות הגדרות ב־Railway:</p>
              <ul className="mt-1 space-y-0.5" dir="ltr">
                {missing.map((item) => (
                  <li key={item} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {microsoft && (
            <>
              {microsoft.connected ? (
                <p className="text-violet-200">
                  Outlook מחובר
                  {microsoft.account && (
                    <>
                      {" "}
                      (
                      <bdi dir="ltr" className="break-all">
                        {microsoft.account}
                      </bdi>
                      )
                    </>
                  )}
                </p>
              ) : microsoft.needsReconnect ? (
                <p className="text-amber-200">ההרשאה של Microsoft פגה או בוטלה. צריך לחבר את התיבה מחדש.</p>
              ) : (
                missing.length === 0 && <p className="text-amber-200">תיבת Outlook עוד לא חוברה. עד שהיא תחובר האתר לא ישלח מיילים.</p>
              )}

              {microsoft.connected && microsoft.displayName !== BRAND_NAME && (
                <p className="text-amber-200">
                  השם שמופיע אצל הנמענים נלקח מחשבון Microsoft, וכרגע הוא {microsoft.displayName ? `"${microsoft.displayName}"` : "ריק"}. כדי
                  שיופיע {BRAND_NAME} צריך לשנות את השם בחשבון (account.microsoft.com ← Your info ← Edit name).
                </p>
              )}

              {microsoft.lastError && (
                <p className="text-white/45">
                  שגיאה אחרונה מ־Microsoft: <bdi dir="ltr">{microsoft.lastError}</bdi>
                  {microsoft.lastErrorAt && ` · ${formatTime(microsoft.lastErrorAt)}`}
                </p>
              )}

              {!microsoft.connected && microsoft.redirectUri && (
                <p className="text-white/45">
                  כתובת ההפניה שצריכה להופיע ב־Microsoft Entra:{" "}
                  <bdi dir="ltr" className="break-all">
                    {microsoft.redirectUri}
                  </bdi>
                </p>
              )}
            </>
          )}

          {status.lastTest && (
            <p className="text-white/45">
              מייל בדיקה אחרון: {status.lastTest.status === "failed" ? "נכשל" : "התקבל אצל הספק"}
              {status.lastTest.errorCode && (
                <>
                  {" "}
                  (<bdi dir="ltr">{status.lastTest.errorCode}</bdi>)
                </>
              )}
              {` · ${formatTime(status.lastTest.at)}`}
            </p>
          )}
        </div>
      )}

      {microsoft && (
        <div className="flex flex-wrap justify-center sm:justify-start gap-3 pt-1">
          {missing.length === 0 && (
            <a href={microsoftConnectUrl()} className="btn-ghost">
              {microsoft.connected ? "חיבור מחדש ל־Outlook" : "חיבור תיבת Outlook"}
            </a>
          )}
          {status.ready && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void onTest()}>
              {busy ? "שולח…" : "שליחת מייל בדיקה אליי"}
            </button>
          )}
          {(microsoft.connected || microsoft.needsReconnect) && (
            <button type="button" className="btn-text text-xs" disabled={busy} onClick={() => void onDisconnect()}>
              ניתוק
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.ok ? "text-violet-200" : "text-red-300"}`} role={message.ok ? "status" : "alert"} aria-live="polite">
          {message.text}
        </p>
      )}
    </div>
  );
}
