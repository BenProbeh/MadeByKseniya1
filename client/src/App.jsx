import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import EntranceIntro from "./components/EntranceIntro.jsx";
import Home from "./pages/Home.jsx";
import Services from "./pages/Services.jsx";
import Gallery from "./pages/Gallery.jsx";
import About from "./pages/About.jsx";
import Booking from "./pages/Booking.jsx";
import Configurator from "./pages/Configurator.jsx";

const INTRO_SEEN_KEY = "mbk_intro_seen";

function shouldShowIntro() {
  if (typeof window === "undefined") return false;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const alreadySeen = sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  return !prefersReducedMotion && !alreadySeen;
}

export default function App() {
  const [showIntro, setShowIntro] = useState(shouldShowIntro);

  function finishIntro() {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    setShowIntro(false);
  }

  if (showIntro) {
    return <EntranceIntro onFinish={finishIntro} onSkip={finishIntro} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/about" element={<About />} />
          <Route path="/build-a-set" element={<Configurator />} />
          <Route path="/booking" element={<Booking />} />
        </Routes>
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
