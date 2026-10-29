import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Camera, ChevronLeft, ImagePlus, KeyRound, LogOut, Mail, Phone, Settings2, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import Sheet from "../components/ui/Sheet.jsx";
import ChangePasswordForm from "../components/ChangePasswordForm.jsx";
import PhoneForm from "../components/PhoneForm.jsx";
import SiteColorSection from "../components/theme/SiteColorSection.jsx";
import { MeasurementsSection, OrdersSection, ShipmentsSection } from "../components/profile/ProfileSections.jsx";
import {
  deleteAvatar,
  fetchProfileMeasurements,
  fetchProfileOrders,
  fetchProfileShipments,
  updateBookingEmailsRequest,
  uploadAvatarDataUrl,
  uploadAvatarFile,
} from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDate } from "../lib/format.js";
import { isStaff, roleLabel } from "../lib/roles.js";

/** Selfie capture in a sheet — its own stream, stopped on close, retake or save. */
function AvatarCamera({ onCancel, onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [starting, setStarting] = useState(true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setStarting(true);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setError("לא הצלחתי לפתוח את המצלמה. אפשר לאשר גישה בהגדרות, או לבחור תמונה מהגלריה.");
    } finally {
      setStarting(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const size = Math.min(video.videoWidth, video.videoHeight, 512);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    // Mirror like the preview so the photo looks the way she saw herself.
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, size, size);
    setPreview(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
  }

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-full bg-black ring-1 ring-white/10">
        {preview ? (
          <img src={preview} alt="תצוגה מקדימה" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover -scale-x-100" playsInline muted autoPlay />
        )}
        {starting && !preview && <span className="absolute inset-0 grid place-items-center"><span className="spinner text-white/70" /></span>}
      </div>
      {error && (
        <p className="notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {preview ? (
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setPreview(null);
                void startCamera();
              }}
            >
              צילום מחדש
            </button>
            <button type="button" className="btn-violet" onClick={() => onCaptured(preview)}>
              שמירה
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-ghost" onClick={onCancel}>
              ביטול
            </button>
            <button type="button" className="btn-violet" onClick={capture} disabled={starting || Boolean(error)}>
              <Camera size={18} aria-hidden="true" />
              צילום
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsRow({ icon: Icon, title, detail, onClick, to, tone, trailing }) {
  const content = (
    <>
      <span
        className={`grid place-items-center w-9 h-9 rounded-[0.625rem] shrink-0 ${tone === "danger" ? "bg-red-500/10 text-red-300" : "bg-white/[0.06] text-violet-200"}`}
        aria-hidden="true"
      >
        <Icon size={19} strokeWidth={1.8} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-body ${tone === "danger" ? "text-red-300" : "text-white"}`}>{title}</span>
        {detail && <span className="block t-foot truncate">{detail}</span>}
      </span>
      {trailing ?? (tone !== "danger" && <ChevronLeft size={20} className="text-white/30 shrink-0" aria-hidden="true" />)}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="list-row">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className="list-row" onClick={onClick}>
      {content}
    </button>
  );
}

/** The customer's personal home: who she is, her sizes and orders, and her account settings. */
export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const fileRef = useRef(null);
  const [sheet, setSheet] = useState(null); // "photo" | "camera" | "phone" | "password" | "logout"
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [toast, setToast] = useState(null); // { ok, text }

  const [measurement, setMeasurement] = useState(undefined);
  const [orders, setOrders] = useState(undefined);
  const [shipments, setShipments] = useState(undefined);
  const [measError, setMeasError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [shipsError, setShipsError] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProfileMeasurements()
      .then((m) => !cancelled && setMeasurement(m))
      .catch(() => {
        if (cancelled) return;
        setMeasurement(null);
        setMeasError("לא הצלחתי לטעון את המידות.");
      });
    fetchProfileOrders()
      .then((o) => !cancelled && setOrders(o))
      .catch(() => {
        if (cancelled) return;
        setOrders([]);
        setOrdersError("לא הצלחתי לטעון רכישות.");
      });
    fetchProfileShipments()
      .then((s) => !cancelled && setShipments(s))
      .catch(() => {
        if (cancelled) return;
        setShipments([]);
        setShipsError("לא הצלחתי לטעון משלוחים.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function runAvatar(task, okText, failText) {
    setSheet(null);
    setAvatarBusy(true);
    try {
      updateUser(await task());
      setToast({ ok: true, text: okText });
    } catch (err) {
      setToast({ ok: false, text: getApiErrorMessage(err, failText) });
    } finally {
      setAvatarBusy(false);
    }
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast({ ok: false, text: "התמונה גדולה מדי (עד 5MB). אפשר לבחור תמונה אחרת." });
      setSheet(null);
      return;
    }
    void runAvatar(() => uploadAvatarFile(file), "התמונה נשמרה.", "לא הצלחתי להעלות את התמונה.");
  }

  async function toggleBookingEmails() {
    if (notifyBusy) return;
    setNotifyBusy(true);
    try {
      updateUser(await updateBookingEmailsRequest(!user.notifyBookingEmails));
    } catch (err) {
      setToast({ ok: false, text: getApiErrorMessage(err, "לא הצלחתי לשמור את ההגדרה.") });
    } finally {
      setNotifyBusy(false);
    }
  }

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const done = (text) => {
    setSheet(null);
    setToast({ ok: true, text });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-2">
      <header className="flex flex-col items-center text-center gap-3">
        <span className="section-eyebrow">Profile</span>
        <button
          type="button"
          onClick={() => setSheet("photo")}
          disabled={avatarBusy}
          className="relative rounded-full mt-1"
          aria-label={user?.avatarUrl ? "החלפת תמונת הפרופיל" : "הוספת תמונת פרופיל"}
        >
          <span className="marquee-frame block rounded-full shadow-glow" style={{ padding: "2.5px" }}>
            <span className="relative block rounded-full bg-[rgb(var(--oled-950))] p-[3px]">
              <UserAvatar user={user} className="h-24 w-24 text-3xl" />
            </span>
          </span>
          <span className="absolute bottom-0.5 end-0.5 grid place-items-center w-8 h-8 rounded-full bg-violet-gradient border-2 border-[rgb(var(--oled-950))]" style={{ color: "#000" }}>
            {avatarBusy ? <span className="spinner w-4 h-4" /> : <Camera size={15} aria-hidden="true" />}
          </span>
        </button>
        <div>
          <h1 className="t-large-title">
            {user?.firstName && user?.lastName ? (
              <>
                {user.firstName} <span className="violet-text">{user.lastName}</span>
              </>
            ) : (
              fullName || user?.username
            )}
          </h1>
          <p className="t-sub mt-0.5">
            {user?.email && (
              <bdi dir="ltr" className="break-all">
                {user.email}
              </bdi>
            )}
          </p>
          {user?.createdAt && <p className="t-foot mt-1">איתי מאז {formatDate(user.createdAt)}</p>}
        </div>
      </header>

      {toast && (
        <p className={toast.ok ? "notice-success" : "notice-error"} role={toast.ok ? "status" : "alert"}>
          {toast.text}
        </p>
      )}

      {isStaff(user) && (
        <div className="list-group">
          <SettingsRow to="/admin" icon={Settings2} title="ניהול העסק" detail={`מחוברת כ${roleLabel(user.role)}`} />
        </div>
      )}

      <MeasurementsSection measurement={measurement} error={measError} eyebrow="Sizes" />
      <OrdersSection orders={orders} error={ordersError} eyebrow="Orders" />
      <ShipmentsSection shipments={shipments} error={shipsError} eyebrow="Shipping" />

      <SiteColorSection />

      <section className="space-y-2" aria-labelledby="account-title">
        <span className="section-eyebrow px-1">Account</span>
        <h2 id="account-title" className="t-title px-1">
          החשבון
        </h2>
        <div className="list-group">
          <SettingsRow
            to="/account/email"
            icon={Mail}
            title="אימייל"
            detail={user?.emailVerified ? <bdi dir="ltr">{user.email}</bdi> : "עוד לא אומת — נדרש לקביעת תור"}
          />
          <SettingsRow icon={Phone} title="טלפון" detail={user?.phone || "לא חובה"} onClick={() => setSheet("phone")} />
          <SettingsRow icon={KeyRound} title="שינוי סיסמה" onClick={() => setSheet("password")} />
          {isStaff(user) && user?.emailVerified && (
            <label className="list-row cursor-pointer">
              <span className="grid place-items-center w-9 h-9 rounded-[0.625rem] bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
                <Bell size={19} strokeWidth={1.8} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-body">מייל על כל בקשה חדשה</span>
                <span className="block t-foot">לצוות בלבד</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="check"
                checked={Boolean(user.notifyBookingEmails)}
                disabled={notifyBusy}
                onChange={() => void toggleBookingEmails()}
              />
            </label>
          )}
        </div>
        <div className="list-group">
          <SettingsRow icon={LogOut} title="התנתקות" tone="danger" onClick={() => setSheet("logout")} />
        </div>
      </section>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChange} />

      <Sheet open={sheet === "photo"} onClose={() => setSheet(null)} title="תמונת פרופיל">
        <div className="list-group">
          <SettingsRow icon={ImagePlus} title="בחירה מהגלריה" onClick={() => fileRef.current?.click()} trailing={null} />
          <SettingsRow icon={Camera} title="צילום עכשיו" onClick={() => setSheet("camera")} trailing={null} />
          {user?.avatarUrl && (
            <SettingsRow
              icon={Trash2}
              title="הסרת התמונה"
              tone="danger"
              onClick={() => void runAvatar(deleteAvatar, "התמונה הוסרה.", "לא הצלחתי להסיר את התמונה.")}
            />
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === "camera"} onClose={() => setSheet(null)} title="צילום תמונה">
        <AvatarCamera
          onCancel={() => setSheet(null)}
          onCaptured={(dataUrl) => void runAvatar(() => uploadAvatarDataUrl(dataUrl), "התמונה נשמרה.", "לא הצלחתי לשמור את התמונה.")}
        />
      </Sheet>

      <Sheet open={sheet === "phone"} onClose={() => setSheet(null)} title="טלפון ליצירת קשר">
        <PhoneForm onDone={done} onCancel={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === "password"} onClose={() => setSheet(null)} title="שינוי סיסמה">
        <ChangePasswordForm onDone={done} onCancel={() => setSheet(null)} />
      </Sheet>

      <Sheet
        open={sheet === "logout"}
        onClose={() => setSheet(null)}
        role="alertdialog"
        title="להתנתק?"
        description="המידות והתורים שלך נשמרים בחשבון."
        footer={
          <>
            <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => setSheet(null)}>
              ביטול
            </button>
            <button type="button" className="btn-danger w-full sm:w-auto" onClick={() => void logout()}>
              התנתקות
            </button>
          </>
        }
      />
    </div>
  );
}
