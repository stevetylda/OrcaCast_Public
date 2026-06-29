import { useEffect, useState } from "react";
import { getCachedDataMeta, loadDataMeta, type DataMeta } from "../../data/meta";
import { formatDataPath } from "../../data/errors";

type MapPageFailureStateProps = {
  title: string;
  message: string;
  failingPath?: string | null;
  status?: number;
  details?: string | null;
  onRetry: () => void;
};

function buildVersionLabel(meta: DataMeta | null): string {
  const buildId =
    typeof import.meta.env.VITE_BUILD_ID === "string" && import.meta.env.VITE_BUILD_ID.trim().length > 0
      ? import.meta.env.VITE_BUILD_ID.trim()
      : "unknown";
  const dataVersion = meta?.data_version?.trim() ? meta.data_version.trim() : "unknown";
  return `Data ${dataVersion} | Build ${buildId}`;
}

export function MapPageFailureState({
  title,
  message,
  failingPath,
  status,
  details,
  onRetry,
}: MapPageFailureStateProps) {
  const [dataMeta, setDataMeta] = useState<DataMeta | null>(() => getCachedDataMeta());

  useEffect(() => {
    let active = true;
    loadDataMeta()
      .then((meta) => {
        if (active) setDataMeta(meta);
      })
      .catch(() => {
        if (active) setDataMeta(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mapFailureState" role="alert" aria-live="polite">
      <div className="mapFailureState__card">
        <p className="mapFailureState__eyebrow">Map unavailable</p>
        <h2 className="mapFailureState__title">{title}</h2>
        <p className="mapFailureState__message">{message}</p>
        {failingPath ? (
          <div className="mapFailureState__pathRow">
            <span className="mapFailureState__pathLabel">Failed file</span>
            <code className="mapFailureState__pathValue">{formatDataPath(failingPath)}</code>
          </div>
        ) : null}
        {typeof status === "number" ? (
          <div className="mapFailureState__statusRow">
            <span className="mapFailureState__pathLabel">Status</span>
            <span className="mapFailureState__statusValue">{status}</span>
          </div>
        ) : null}
        <div className="mapFailureState__version">{buildVersionLabel(dataMeta)}</div>
        <div className="mapFailureState__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Retry
          </button>
        </div>
        {details ? (
          <details className="mapFailureState__details">
            <summary className="mapFailureState__detailsSummary">Details</summary>
            <pre className="mapFailureState__detailsBody">{details}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
