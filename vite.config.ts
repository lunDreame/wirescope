import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Inject Tauri mock when running outside of a real Tauri context (plain browser / E2E)
function tauriMockPlugin() {
  return {
    name: "tauri-mock-inject",
    transformIndexHtml() {
      if (process.env.TAURI_DEV_HOST) return []; // real Tauri — skip
      const mockPath = path.resolve(__dirname, "e2e/tauri-mock.js");
      if (!fs.existsSync(mockPath)) return [];
      const code = fs.readFileSync(mockPath, "utf-8");
      return [{ tag: "script", attrs: { type: "text/javascript" }, children: code, injectTo: "head-prepend" }];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tauriMockPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
