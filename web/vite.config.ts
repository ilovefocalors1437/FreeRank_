import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API (../server.js) runs on 3399; in dev, Vite proxies to it.
// `--mode static` builds the serverless demo (engine in the page) for GitHub Pages;
// BASE_PATH is the site's sub-path there, e.g. "/FreeRank_/".
export default defineConfig(({ mode }) => ({
  base: mode === "static" ? process.env.BASE_PATH || "/" : "/",
  plugins: [
    react(),
    // Pages has no SPA fallback: serve the app for unknown paths so deep links work.
    mode === "static" && { name: "spa-404", closeBundle: () => copyFileSync(new URL("dist/index.html", import.meta.url), new URL("dist/404.html", import.meta.url)) },
  ],
  server: { port: 5178, strictPort: true, proxy: { "/api": "http://localhost:3399" } },
  // The static chunk carries the engine, corpus and 8x8 grids (~180 kB gzipped).
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 700 },
}));
