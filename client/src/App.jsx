import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Services from "./pages/Services.jsx";
import PackageDetail from "./pages/PackageDetail.jsx";
import Gallery from "./pages/Gallery.jsx";
import Booking from "./pages/Booking.jsx";
import Configurator from "./pages/Configurator.jsx";
import NailSizing from "./pages/NailSizing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import EmailSetup from "./pages/EmailSetup.jsx";
import AppointmentConfirm from "./pages/AppointmentConfirm.jsx";
import Profile from "./pages/Profile.jsx";
import AdminCustomers from "./pages/AdminCustomers.jsx";
import AdminCustomerProfile from "./pages/AdminCustomerProfile.jsx";
import AdminNotifications from "./pages/AdminNotifications.jsx";
import AdminAppointments from "./pages/AdminAppointments.jsx";
import AdminContent from "./pages/AdminContent.jsx";
import AdminContentEditor from "./pages/AdminContentEditor.jsx";
import ContentPage from "./pages/ContentPage.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { AUTH_PAGES } from "./lib/authPaths.js";

function AuthBoot({ children }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-oled-950">
        <div className="glass-panel px-8 py-6 text-center space-y-3">
          <img
            src="/logo.png"
            alt="MadeByKseniya"
            className="h-20 w-auto mx-auto object-contain drop-shadow-[0_0_12px_rgba(176,38,255,0.55)]"
          />
          <p className="font-serif text-white/70 text-sm">רגע אחד, אני בודקת את החיבור…</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { pathname } = useLocation();
  const isAuthPage = AUTH_PAGES.includes(pathname) || pathname === "/appointments/confirm";

  return (
    <AuthBoot>
      <div className="min-h-screen flex flex-col">
        <ScrollToTop />
        {!isAuthPage && <Navbar />}
        <main className={`flex-1 ${isAuthPage ? "pt-8" : "pt-24"}`}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/account/email" element={<EmailSetup />} />
            <Route path="/appointments/confirm" element={<AppointmentConfirm />} />
            <Route path="/" element={<Navigate to="/services" replace />} />
            <Route path="/about" element={<Navigate to="/services" replace />} />
            <Route
              path="/services"
              element={
                <ProtectedRoute>
                  <Services />
                </ProtectedRoute>
              }
            />
            <Route
              path="/services/:slug"
              element={
                <ProtectedRoute>
                  <PackageDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gallery"
              element={
                <ProtectedRoute>
                  <Gallery />
                </ProtectedRoute>
              }
            />
            <Route
              path="/build-a-set"
              element={
                <ProtectedRoute>
                  <Configurator />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nail-sizing"
              element={
                <ProtectedRoute>
                  <NailSizing />
                </ProtectedRoute>
              }
            />
            <Route
              path="/booking"
              element={
                <ProtectedRoute>
                  <Booking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/customers"
              element={
                <AdminRoute>
                  <AdminCustomers />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/customers/:id"
              element={
                <AdminRoute>
                  <AdminCustomerProfile />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/appointments"
              element={
                <AdminRoute>
                  <AdminAppointments />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/notifications"
              element={
                <AdminRoute>
                  <AdminNotifications />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/content"
              element={
                <AdminRoute>
                  <AdminContent />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/content/new"
              element={
                <AdminRoute>
                  <AdminContentEditor />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/content/:id"
              element={
                <AdminRoute>
                  <AdminContentEditor />
                </AdminRoute>
              }
            />
            <Route
              path="/:slug"
              element={
                <ProtectedRoute>
                  <ContentPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/services" replace />} />
          </Routes>
        </main>
        {!isAuthPage && <Footer />}
        {!isAuthPage && <ChatWidget />}
      </div>
    </AuthBoot>
  );
}
