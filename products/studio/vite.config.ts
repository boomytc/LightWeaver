import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.LIGHTWEAVER_STUDIO_HOST ?? "127.0.0.1";
const port = Number(process.env.LIGHTWEAVER_STUDIO_PORT ?? 5175);
const api = Number(process.env.LIGHTWEAVER_API_PORT ?? 5176);

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://${host}:${api}`,
        changeOrigin: true,
        timeout: 180000,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const token = process.env.LIGHTWEAVER_SESSION_TOKEN;
            if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
          });
        },
      },
    },
  },
  preview: {
    host,
    port: 4175,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://${host}:${api}`,
        changeOrigin: true,
        timeout: 180000,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const token = process.env.LIGHTWEAVER_SESSION_TOKEN;
            if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
          });
        },
      },
    },
  },
});
