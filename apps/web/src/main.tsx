import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LocaleProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <LocaleProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </LocaleProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
