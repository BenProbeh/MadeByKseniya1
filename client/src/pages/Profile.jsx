import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import ChangePasswordForm from "../components/ChangePasswordForm.jsx";
import PhoneForm from "../components/PhoneForm.jsx";
import { MeasurementsSection, OrdersSection, ShipmentsSection } from "../components/profile/ProfileSections.jsx";
import {
  deleteAvatar,
  fetchProfileMeasurements,
  fetchProfileOrders,
  fetchProfileShipments,
  uploadAvatarDataUrl,
  uploadAvatarFile,
} from "../lib/authApi.js";
import { formatDate } from "../lib/format.js";
import { isStaff } from "../lib/roles.js";

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
      setError("לא הצלחתי לפתוח את המצלמה. אפשר לאשר גישה ולנסות שוב.");
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
          setMeasError("לא הצלחתי לטעון את המידות.");
        }
      }
      try {
        const o = await fetchProfileOrders();
        if (!cancelled) setOrders(o);
      } catch {
        if (!cancelled) {
          setOrders([]);
          setOrdersError("לא הצלחתי לטעון רכישות.");
        }
      }
      try {
        const s = await fetchProfileShipments();
        if (!cancelled) setShipments(s);
      } catch {
        if (!cancelled) {
          setShipments([]);
          setShipsError("לא הצלחתי לטעון משלוחים.");
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
      setAvatarError(err?.response?.data?.error || "לא הצלחתי להעלות את התמונה.");
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
      setAvatarError(err?.response?.data?.error || "לא הצלחתי לשמור את התמונה.");
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
      setAvatarError("לא הצלחתי למחוק את התמונה.");
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
            {isStaff(user) && (
              <div className="pt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
                <Link to="/admin/customers" className="btn-ghost px-5 py-2.5 text-sm">
                  ניהול לקוחות
                </Link>
                <Link to="/admin/content" className="btn-ghost px-5 py-2.5 text-sm">
                  ניהול תוכן
                </Link>
              </div>
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

        <div className="border-t border-white/[0.08] pt-5">
          <PhoneForm />
        </div>

        <div className="border-t border-white/[0.08] pt-5">
          <ChangePasswordForm />
        </div>
      </section>

      <MeasurementsSection measurement={measurement} error={measError} />
      <OrdersSection orders={orders} error={ordersError} />
      <ShipmentsSection shipments={shipments} error={shipsError} />

      <div className="flex justify-center">
        <button type="button" className="btn-text text-sm text-white/50" onClick={() => logout()}>
          התנתקות
        </button>
      </div>

      <AvatarCameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={onCameraCaptured} />
    </div>
  );
}
