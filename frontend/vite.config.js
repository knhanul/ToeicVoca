import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/voca/",
  plugins: [react()],
  server: {
    proxy: {
      "/voca/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/voca/, ""),
      },
    },
  },
});
