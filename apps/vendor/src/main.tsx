import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mercurjs/vendor/index.css";
import App from "@mercurjs/vendor";

// The shipped Mercur Persian translations and direction-aware UI remain native.
document.documentElement.lang = "fa";
document.documentElement.dir = "rtl";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
