import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Metadata improves cache versioning and About-page diagnostics, but it must
// never prevent metadata-independent routes from rendering.
const primeForecastMetadata = () => {
  void import("./shared/data/meta")
    .then(({ primeDataMeta }) => primeDataMeta())
    .catch((error: unknown) => {
      console.warn("Forecast metadata could not be primed; continuing.", error);
    });
};

if ("requestIdleCallback" in window) {
  window.requestIdleCallback(primeForecastMetadata, { timeout: 2_000 });
} else {
  globalThis.setTimeout(primeForecastMetadata, 0);
}
