import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { StoreProvider } from "./store/StoreContext";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary><BrowserRouter>
      <AuthProvider><StoreProvider><ToastProvider><App /></ToastProvider></StoreProvider></AuthProvider>
    </BrowserRouter></AppErrorBoundary>
  </StrictMode>,
);
