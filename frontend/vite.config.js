import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/hackersvoca/",
  plugins: [react()],
  server: {
    proxy: {
      "/hackersvoca/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hackersvoca/, ""),
      },
    },
  },
});
