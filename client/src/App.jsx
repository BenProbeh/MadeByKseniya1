import { Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import Services from "./pages/Services.jsx";
import PackageDetail from "./pages/PackageDetail.jsx";
import Gallery from "./pages/Gallery.jsx";
import About from "./pages/About.jsx";
import Booking from "./pages/Booking.jsx";
import Configurator from "./pages/Configurator.jsx";
import NailSizing from "./pages/NailSizing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Profile from "./pages/Profile.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function AuthBoot({ children }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-oled-950">
        <div className="glass-panel px-8 py-6 text-center space-y-2">
          <span className="section-eyebrow justify-center">MadeByKseniya</span>
          <p className="font-serif text-white/70 text-sm">רגע אחד, בודקים את החיבור…</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isAuthPage = pathname === "/login" || pathname === "/register";

  return (
    <AuthBoot>
      <div className="min-h-screen flex flex-col">
        <ScrollToTop />
        {!isAuthPage && <Navbar />}
        <main className={`flex-1 ${isHome || isAuthPage ? "" : "pt-24"} ${isAuthPage ? "pt-8" : ""}`}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
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
              path="/about"
              element={
                <ProtectedRoute>
                  <About />
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
          </Routes>
        </main>
        {!isHome && !isAuthPage && <Footer />}
        {!isAuthPage && <ChatWidget />}
      </div>
    </AuthBoot>
  );
}
