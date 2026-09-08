import React, { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { AppProvider } from "./state/store.js";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("React error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ color: "#f5eedc", background: "#1a1410", padding: "20px", fontFamily: "monospace" }}>
          <h1>Cardinal failed to load</h1>
          <pre style={{ color: "#e06c5a" }}>{String(this.state.error)}</pre>
          <p>Check browser console for details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("No root element found");
  console.log("[Cardinal] Initializing app...");

  createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AppProvider>
          <App />
        </AppProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
  console.log("[Cardinal] React app mounted successfully");
} catch (e) {
  console.error("[Cardinal] Fatal initialization error:", e);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="color: #f5eedc; background: #1a1410; padding: 20px; font-family: monospace;">
      <h1>Cardinal failed to load</h1>
      <pre style="color: #e06c5a; white-space: pre-wrap;">${String(e instanceof Error ? e.message : e)}</pre>
      <p>Check browser console for details.</p>
    </div>`;
  }
}
