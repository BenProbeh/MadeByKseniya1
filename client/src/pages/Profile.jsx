import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import {
  deleteAvatar,
  fetchProfileMeasurements,
  fetchProfileOrders,
  fetchProfileShipments,
  uploadAvatarDataUrl,
  uploadAvatarFile,
} from "../lib/authApi.js";

function formatMoney(agorot, currency = "ILS") {
  const ils = (Number(agorot) || 0) / 100;
  try {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(ils);
  } catch {
    return `${ils.toFixed(2)} ₪`;
  }
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Isolated selfie capture — does not share stream with nail sizing. */
function AvatarCameraModal({ open, onClose, onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [starting, setStarting] = useState(false);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current || videoRef.current?.srcObject;
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.pause?.();
      } catch {
        /* ignore */
      }
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setStarting(true);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("לא הצלחנו לפתוח את המצלמה. אפשר לאשר גישה ולנסות שוב.");
    } finally {
      setStarting(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!open) return undefined;
    setPreview(null);
    void startCamera();
    const onKey = (e) => {
      if (e.key === "Escape") {
        stopCamera();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopCamera();
    };
  }, [open, startCamera, stopCamera, onClose]);

  if (!open) return null;

  function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const size = Math.min(video.videoWidth, video.videoHeight, 512);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    setPreview(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-oled-950/80 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="צילום תמונת פרופיל"
    >
      <div className="glass-panel p-5 md:p-6 w-full max-w-md space-y-4">
        <h3 className="font-serif text-2xl text-white text-center">צילום תמונה</h3>
        {!preview ? (
          <div className="relative aspect-square overflow-hidden rounded-xl bg-black border border-white/10">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
          </div>
        ) : (
          <img src={preview} alt="תצוגה מקדימה" className="aspect-square w-full object-cover rounded-xl" />
        )}
        {error && (
          <p className="text-sm text-red-300 text-center" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3 justify-between">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              stopCamera();
              onClose();
            }}
          >
            ביטול
          </button>
          {!preview ? (
            <button type="button" className="btn-violet" onClick={capture} disabled={starting}>
              צלמי
            </button>
          ) : (
            <div className="flex gap-2">
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
              <button
                type="button"
                className="btn-violet"
                onClick={() => {
                  onCaptured(preview);
                  stopCamera();
                  onClose();
                }}
              >
                שמירת התמונה
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const fileRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarOk, setAvatarOk] = useState("");

  const [measurement, setMeasurement] = useState(undefined);
  const [orders, setOrders] = useState(undefined);
  const [shipments, setShipments] = useState(undefined);
  const [measError, setMeasError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [shipsError, setShipsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchProfileMeasurements();
        if (!cancelled) setMeasurement(m);
      } catch {
        if (!cancelled) {
          setMeasurement(null);
          setMeasError("לא הצלחנו לטעון את המידות.");
        }
      }
      try {
        const o = await fetchProfileOrders();
        if (!cancelled) setOrders(o);
      } catch {
        if (!cancelled) {
          setOrders([]);
          setOrdersError("לא הצלחנו לטעון רכישות.");
        }
      }
      try {
        const s = await fetchProfileShipments();
        if (!cancelled) setShipments(s);
      } catch {
        if (!cancelled) {
          setShipments([]);
          setShipsError("לא הצלחנו לטעון משלוחים.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    setAvatarOk("");
    setAvatarBusy(true);
    try {
      const next = await uploadAvatarFile(file);
      updateUser(next);
      setAvatarOk("התמונה נשמרה.");
    } catch (err) {
      setAvatarError(err?.response?.data?.error || "לא הצלחנו להעלות את התמונה.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onCameraCaptured(dataUrl) {
    setAvatarError("");
    setAvatarOk("");
    setAvatarBusy(true);
    try {
      const next = await uploadAvatarDataUrl(dataUrl);
      updateUser(next);
      setAvatarOk("התמונה נשמרה.");
    } catch (err) {
      setAvatarError(err?.response?.data?.error || "לא הצלחנו לשמור את התמונה.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onDeleteAvatar() {
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const next = await deleteAvatar();
      updateUser(next);
      setAvatarOk("התמונה הוסרה.");
    } catch {
      setAvatarError("לא הצלחנו למחוק את התמונה.");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Profile</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          הפרופיל <span className="violet-text">שלי</span>
        </h1>
        <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">
          כל המידות, ההזמנות והעדכונים שלך במקום אחד.
        </p>
      </div>

      <section className="glass-panel p-6 md:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right">
          <UserAvatar user={user} className="h-24 w-24 md:h-28 md:w-28 text-3xl" />
          <div className="space-y-1 min-w-0">
            <h2 className="font-serif text-2xl md:text-3xl text-white">
              {user?.firstName} {user?.lastName}
            </h2>
            <p className="text-sm text-white/50">@{user?.username}</p>
            {user?.createdAt && (
              <p className="text-xs text-white/35">הצטרפת ב־{formatDate(user.createdAt)}</p>
            )}
          </div>
        </div>

        <div className="space-y-2 text-center sm:text-right">
          <p className="font-serif text-white/80">רוצה להוסיף תמונה?</p>
          <p className="font-serif text-sm text-white/50">בחרי תמונה שאת אוהבת או צלמי אחת עכשיו.</p>
        </div>

        <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
          <button
            type="button"
            className="btn-violet"
            disabled={avatarBusy}
            onClick={() => fileRef.current?.click()}
          >
            בחירה מהאלבום
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={avatarBusy}
            onClick={() => setCameraOpen(true)}
          >
            צילום תמונה
          </button>
          {user?.avatarUrl && (
            <button type="button" className="btn-text text-xs" disabled={avatarBusy} onClick={onDeleteAvatar}>
              הסרת תמונה
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFileChange}
        />
        {avatarError && (
          <p className="text-sm text-red-300 text-center" role="alert" aria-live="polite">
            {avatarError}
          </p>
        )}
        {avatarOk && (
          <p className="text-sm text-violet-200 text-center" role="status" aria-live="polite">
            {avatarOk}
          </p>
        )}
      </section>

      <section className="glass-panel p-6 space-y-4">
        <div className="text-center space-y-1">
          <h2 className="font-serif text-2xl md:text-3xl text-white">המידות שלי</h2>
          <p className="font-serif text-white/60 text-sm">כאן נשמור את ההתאמה שלך לפעמים הבאות.</p>
        </div>
        {measurement === undefined && (
          <p className="text-sm text-white/45 text-center">טוענים מידות…</p>
        )}
        {measError && <p className="text-sm text-amber-200 text-center">{measError}</p>}
        {measurement === null && (
          <div className="text-center space-y-4 py-2">
            <p className="font-serif text-white">עדיין לא שמרנו את המידות שלך</p>
            <p className="font-serif text-sm text-white/55">
              מדידה קצרה תעזור לנו להתאים לך את הסט בצורה מדויקת יותר.
            </p>
            <Link to="/nail-sizing" className="btn-violet inline-flex">
              להתחלת מדידה
            </Link>
          </div>
        )}
        {measurement && (
          <div className="grid md:grid-cols-2 gap-4">
            {["right", "left"].map((hand) => {
              const block = measurement.hands?.[hand];
              if (!block?.fingers?.length) return null;
              return (
                <div key={hand} className="space-y-3 border border-white/[0.08] rounded-xl p-4">
                  <h3 className="font-serif text-xl text-white">{block.labelHe}</h3>
                  <ul className="space-y-2 text-sm text-white/75">
                    {block.fingers.map((f) => (
                      <li key={f.fingerId} className="flex justify-between gap-3">
                        <span>{f.labelHe}</span>
                        <span className="text-white/50">
                          {f.size != null ? `מידה ${f.size}` : f.widthMm != null ? `${f.widthMm} מ״מ` : "—"}
                          {f.photoQualityScore != null ? ` · ${f.photoQualityScore}/100` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="md:col-span-2 flex justify-center pt-2">
              <Link to="/nail-sizing" className="btn-text text-sm">
                מדידה מחדש
                <span className="btn-text-arrow">←</span>
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="glass-panel p-6 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl text-white text-center">הרכישות האחרונות שלי</h2>
        {orders === undefined && <p className="text-sm text-white/45 text-center">טוענים רכישות…</p>}
        {ordersError && <p className="text-sm text-amber-200 text-center">{ordersError}</p>}
        {orders && orders.length === 0 && (
          <p className="font-serif text-sm text-white/55 text-center">
            עדיין אין כאן רכישות — הסט הראשון שלך מחכה לך.
          </p>
        )}
        {orders && orders.length > 0 && (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 border-b border-white/[0.08] last:border-0 pb-3 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-white/90">{o.titleHe || o.orderNumber}</p>
                  <p className="text-xs text-white/45">
                    {formatDate(o.createdAt)} · {o.statusHe}
                  </p>
                </div>
                <p className="font-serif text-violet-200 shrink-0">{formatMoney(o.totalAmount, o.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-panel p-6 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl text-white text-center">איפה ההזמנה שלי?</h2>
        {shipments === undefined && <p className="text-sm text-white/45 text-center">טוענים משלוחים…</p>}
        {shipsError && <p className="text-sm text-amber-200 text-center">{shipsError}</p>}
        {shipments && shipments.length === 0 && (
          <p className="font-serif text-sm text-white/55 text-center">אין כרגע משלוח פעיל.</p>
        )}
        {shipments && shipments.length > 0 && (
          <ul className="space-y-4">
            {shipments.map((s) => (
              <li key={s.id} className="border border-white/[0.08] rounded-xl p-4 space-y-2">
                <p className="font-serif text-white">הזמנה {s.orderNumber}</p>
                <p className="text-sm text-violet-200">{s.statusHe}</p>
                {s.trackingNumber && (
                  <p className="text-xs text-white/45">
                    מעקב: {s.trackingNumber}
                    {s.trackingUrl && (
                      <>
                        {" · "}
                        <a href={s.trackingUrl} className="text-violet-300" target="_blank" rel="noreferrer">
                          קישור
                        </a>
                      </>
                    )}
                  </p>
                )}
                <p className="text-xs text-white/35">עודכן {formatDate(s.updatedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-center">
        <button type="button" className="btn-text text-sm text-white/50" onClick={() => logout()}>
          התנתקות
        </button>
      </div>

      <AvatarCameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={onCameraCaptured} />
    </div>
  );
}
