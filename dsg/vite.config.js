import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same as DSG 2.0 (dsg-sso.md 2.1): the browser sees one origin, and /api is
// proxied to Express. That keeps the SSO callback and its state cookie on the
// same origin as the SPA.
const proxy = { "/api": "http://127.0.0.1:5001" };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
});
