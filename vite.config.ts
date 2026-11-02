import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(() => ({
  base: "/",
  plugins: [react()],
  build: {
    manifest: true,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("maplibre-gl")) return "map-vendor";
          if (id.includes("driver.js")) return "tour-vendor";
          if (id.includes("zod")) return "validation-vendor";
          if (id.includes("html-to-image")) return "export-vendor";
          return "vendor";
        },
      },
    },
  },
}));
