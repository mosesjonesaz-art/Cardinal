import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { AppProvider } from "./state/store.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
