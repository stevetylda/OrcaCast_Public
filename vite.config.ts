// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

// // https://vite.dev/config/
// export default defineConfig(({ mode }) => ({
//   base: mode === "production" ? "/OrcaCast_App/" : "/",
//   plugins: [react()],
// }));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(() => ({
  base: "/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("maplibre-gl") || id.includes("@deck.gl")) return "map-vendor";
          if (id.includes("plotly.js") || id.includes("react-plotly.js")) return "plotly-vendor";
          if (id.includes("reactflow")) return "flow-vendor";
          if (id.includes("driver.js")) return "tour-vendor";
          return "vendor";
        },
      },
    },
  },
}));
