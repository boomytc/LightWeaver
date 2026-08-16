import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.LIGHTWEAVER_STUDIO_HOST ?? "127.0.0.1";
const port = Number(process.env.LIGHTWEAVER_STUDIO_PORT ?? 5175);
const api = Number(process.env.LIGHTWEAVER_API_PORT ?? 8788);

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      "/api": { target: `http://${host}:${api}`, timeout: 180000 },
    },
  },
  preview: {
    host,
    port: 4175,
    strictPort: true,
    proxy: {
      "/api": { target: `http://${host}:${api}`, timeout: 180000 },
    },
  },
});
