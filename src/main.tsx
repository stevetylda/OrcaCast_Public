import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "driver.js/dist/driver.css";
import { WatchPageFailureState } from "./pages/WatchPage";
import { normalizeDataLoadError } from "./shared/data/errors";
import { primeDataMeta } from "./shared/data/meta";

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
        <WatchPageFailureState
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
