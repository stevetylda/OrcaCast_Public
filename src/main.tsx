import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "driver.js/dist/driver.css";
import { primeDataMeta } from "./shared/data/meta";

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Metadata improves cache versioning and About-page diagnostics, but it must
// never prevent metadata-independent routes from rendering.
void primeDataMeta().catch((error: unknown) => {
  console.warn("Forecast metadata could not be primed; continuing.", error);
});
