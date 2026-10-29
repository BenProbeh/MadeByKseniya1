import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/700.css";
import "@fontsource/sekuya/latin-400.css";
// Cursor-era brand display face: the colour dot-matrix Latin for brand words, prices and sizes.
import "@fontsource-variable/bitcount-ink/full.css";
import "@fontsource/alex-brush/latin-400.css";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
