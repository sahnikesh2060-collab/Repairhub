import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Defaults match `npm run dev`; the E2E run overrides them so it never collides with it.
const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:5000';
const PORT = Number(process.env.VITE_PORT || 5173);

// The proxy keeps the API, uploads and Socket.io on the Vite origin in development, so the
// httpOnly refresh cookie (path /api/auth) is sent same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: PORT,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/uploads': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
