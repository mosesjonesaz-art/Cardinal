import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Cardinal — AI Co-DM",
        short_name: "Cardinal",
        description: "Backstage-only AI assistant for Dungeon Masters. DM-facing only.",
        theme_color: "#1a1410",
        background_color: "#1a1410",
        display: "standalone",
        orientation: "any",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
        // API calls are never cached; the app degrades to the mock provider when offline.
        runtimeCaching: [],
      },
    }),
  ],
  server: { port: 5173 },
  build: { target: "es2022", sourcemap: true },
});
