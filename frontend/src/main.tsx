import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Soroban / Stellar SDK expects a global Buffer in the browser.
if (typeof window !== "undefined") {
  (window as unknown as { Buffer: typeof Buffer }).Buffer =
    (window as unknown as { Buffer?: typeof Buffer }).Buffer || Buffer;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
