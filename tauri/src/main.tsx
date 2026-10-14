import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import App from "./App";

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) await import("./dev/mock");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
