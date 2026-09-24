import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API (../server.js) runs on 3399; in dev, Vite proxies to it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5178, strictPort: true, proxy: { "/api": "http://localhost:3399" } },
  build: { outDir: "dist", emptyOutDir: true },
});
