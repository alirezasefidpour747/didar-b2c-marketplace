import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mercurjs/admin/index.css";
import { NativeResume } from "@didar-ui/native-handoff";
import { getAuthHeaders } from "@mercurjs/admin";
declare const __BACKEND_URL__: string;
import App from "@mercurjs/admin";

// The shipped Mercur Persian translations and direction-aware UI remain native.
document.documentElement.lang = "fa";
document.documentElement.dir = "rtl";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NativeResume
      base="/dashboard"
      surface="admin"
      backend={__BACKEND_URL__}
      headers={getAuthHeaders}
    />
    <App />
  </StrictMode>,
);
