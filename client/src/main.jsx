import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/heebo/300.css";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/700.css";
import "@fontsource/heebo/900.css";
import "@fontsource/sekuya";
import "@fontsource/suez-one";
import "@fontsource-variable/bitcount-ink/full.css";
import "@fontsource/luckiest-guy";
import "@fontsource/alex-brush";
import "./index.css";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
