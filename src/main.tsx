import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "driver.js/dist/driver.css";
import { MapPageFailureState } from "./pages/MapPage/MapPageFailureState";
import { normalizeDataLoadError } from "./data/errors";
import { primeDataMeta } from "./data/meta";

async function bootstrap() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  try {
    await primeDataMeta();
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    const dataError = normalizeDataLoadError(error, "/data/meta.json");
    root.render(
      <React.StrictMode>
        <MapPageFailureState
          title="Data failed to load"
          message="A required metadata file could not be parsed."
          failingPath={dataError.path}
          status={dataError.status}
          details={dataError.details ?? dataError.message}
          onRetry={() => window.location.reload()}
        />
      </React.StrictMode>
    );
  }
}

void bootstrap();
