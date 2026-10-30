import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/shell/AppShell.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
// Not lazy: the 404 must show even when screen code cannot be fetched.
import NotFound from "./pages/NotFound.jsx";

// Screens load on demand so the first paint ships only the shell (the camera flow and admin stay out of it).
const Home = lazy(() => import("./pages/Home.jsx"));
const Services = lazy(() => import("./pages/Services.jsx"));
const PackageDetail = lazy(() => import("./pages/PackageDetail.jsx"));
const Gallery = lazy(() => import("./pages/Gallery.jsx"));
const Booking = lazy(() => import("./pages/Booking.jsx"));
const Appointments = lazy(() => import("./pages/Appointments.jsx"));
const Configurator = lazy(() => import("./pages/Configurator.jsx"));
const NailSizing = lazy(() => import("./pages/NailSizing.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail.jsx"));
const EmailSetup = lazy(() => import("./pages/EmailSetup.jsx"));
const AppointmentConfirm = lazy(() => import("./pages/AppointmentConfirm.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const ContentPage = lazy(() => import("./pages/ContentPage.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const AdminMore = lazy(() => import("./pages/AdminMore.jsx"));
const AdminCustomers = lazy(() => import("./pages/AdminCustomers.jsx"));
const AdminCustomerProfile = lazy(() => import("./pages/AdminCustomerProfile.jsx"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications.jsx"));
const AdminAppointments = lazy(() => import("./pages/AdminAppointments.jsx"));
const AdminContent = lazy(() => import("./pages/AdminContent.jsx"));
const AdminContentEditor = lazy(() => import("./pages/AdminContentEditor.jsx"));

function BootScreen() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-6 overflow-x-clip" role="status" aria-live="polite">
      <div className="auth-stage">
        <img src="/logo.png" alt="MadeByKseniya" className="h-24 w-auto object-contain" />
      </div>
      <span className="spinner text-violet-300" aria-hidden="true" />
      <span className="sr-only">טוענת…</span>
    </div>
  );
}

/** Placeholder while a screen's code arrives: the title and two blocks, so nothing jumps. */
function ScreenSkeleton() {
  return (
    <div className="space-y-5 pt-2" aria-hidden="true">
      <div className="skeleton h-8 w-44" />
      <div className="skeleton h-4 w-64" />
      <div className="skeleton h-40 w-full rounded-card" />
      <div className="skeleton h-24 w-full rounded-card" />
    </div>
  );
}

const customer = (el) => <ProtectedRoute>{el}</ProtectedRoute>;
const staff = (el) => <AdminRoute>{el}</AdminRoute>;

export default function App() {
  const { loading } = useAuth();
  if (loading) return <BootScreen />;

  return (
    <AppShell>
      <ScrollToTop />
      <Suspense fallback={<ScreenSkeleton />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/account/email" element={<EmailSetup />} />
          <Route path="/appointments/confirm" element={<AppointmentConfirm />} />

          <Route path="/" element={customer(<Home />)} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="/services" element={customer(<Services />)} />
          <Route path="/services/:slug" element={customer(<PackageDetail />)} />
          <Route path="/gallery" element={customer(<Gallery />)} />
          <Route path="/build-a-set" element={customer(<Configurator />)} />
          <Route path="/nail-sizing" element={customer(<NailSizing />)} />
          <Route path="/appointments" element={customer(<Appointments />)} />
          <Route path="/booking" element={customer(<Booking />)} />
          <Route path="/profile" element={customer(<Profile />)} />

          <Route path="/admin" element={staff(<AdminDashboard />)} />
          <Route path="/admin/more" element={staff(<AdminMore />)} />
          <Route path="/admin/customers" element={staff(<AdminCustomers />)} />
          <Route path="/admin/customers/:id" element={staff(<AdminCustomerProfile />)} />
          <Route path="/admin/appointments" element={staff(<AdminAppointments />)} />
          <Route path="/admin/notifications" element={staff(<AdminNotifications />)} />
          <Route path="/admin/content" element={staff(<AdminContent />)} />
          <Route path="/admin/content/new" element={staff(<AdminContentEditor />)} />
          <Route path="/admin/content/:id" element={staff(<AdminContentEditor />)} />

          <Route path="/:slug" element={customer(<ContentPage />)} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
