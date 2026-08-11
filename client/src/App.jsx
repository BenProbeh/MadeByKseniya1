import { Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import Home from "./pages/Home.jsx";
import Services from "./pages/Services.jsx";
import PackageDetail from "./pages/PackageDetail.jsx";
import Gallery from "./pages/Gallery.jsx";
import About from "./pages/About.jsx";
import Booking from "./pages/Booking.jsx";
import Configurator from "./pages/Configurator.jsx";

export default function App() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className={`flex-1 ${isHome ? "" : "pt-24"}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/services/:slug" element={<PackageDetail />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/about" element={<About />} />
          <Route path="/build-a-set" element={<Configurator />} />
          <Route path="/booking" element={<Booking />} />
        </Routes>
      </main>
      {!isHome && <Footer />}
      <ChatWidget />
    </div>
  );
}
