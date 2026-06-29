import { AttributionHover } from "./AttributionHover";
import { useEffect, useState } from "react";
import { getCachedDataMeta, loadDataMeta, type DataMeta } from "../data/meta";

type Props = {
  modelVersion: string;
  modelId: string;
  modelOptions: Array<{ value: string; label: string }>;
  onModelChange: (v: string) => void;
  compareEnabled?: boolean;
  onShareSnapshot?: () => void;
  onDownloadSnapshot?: () => void;
  shareBusy?: boolean;
  shareDisabled?: boolean;
  shareDisabledReason?: string;
};

export function AppFooter({
  modelVersion,
  modelId,
  modelOptions,
  onModelChange,
  compareEnabled = false,
  onShareSnapshot,
  onDownloadSnapshot,
  shareBusy = false,
  shareDisabled = false,
  shareDisabledReason,
}: Props) {
  const [dataMeta, setDataMeta] = useState<DataMeta | null>(() => getCachedDataMeta());
  const activeModel =
    modelOptions.find((option) => option.value === modelId) ?? modelOptions[0];
  const hasOptions = modelOptions.length > 0;
  const activeLabel = activeModel?.label ?? "Model";

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

  const handleModelSelect = (value: string, target: HTMLElement) => {
    onModelChange(value);
    const details = target.closest("details");
    if (details) {
      details.removeAttribute("open");
    }
  };

  return (
    <div className={`footer${compareEnabled ? " footer--compare" : ""}`}>
      <div className="footer__row" role="group" aria-label="Model controls">
        <div className="footer__pill footer__pill--static footer__pill--version">
          <span className="footer__label">Version</span>
          <span className="footer__value">{modelVersion}</span>
        </div>

        {dataMeta && (
          <div
            className="footer__pill footer__pill--static footer__pill--version"
            title={
              dataMeta.generated_at
                ? `Generated ${dataMeta.generated_at}`
                : "Dataset metadata"
            }
          >
            <span className="footer__label">Data</span>
            <span className="footer__value">{dataMeta.data_version}</span>
          </div>
        )}

        {compareEnabled ? (
          <div className="footer__pill footer__pill--static footer__pill--compareMode">
            <span className="footer__value">IN COMPARE MODE</span>
          </div>
        ) : (
          <details className="footer__pill footer__pill--dropdown" data-tour="model-selector">
            <summary className="footer__pillSummary">
              <span className="footer__value">{activeLabel}</span>
            </summary>
            {hasOptions && (
              <div className="footer__menu" role="listbox" aria-label="Model">
                {modelOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      option.value === modelId
                        ? "footer__menuButton footer__menuButton--active"
                        : "footer__menuButton"
                    }
                    onClick={(event) => handleModelSelect(option.value, event.currentTarget)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </details>
        )}

        <div className="footer__rightCluster">
          <AttributionHover className="footer__pill footer__pill--sources" />
          <div className="footer__pill footer__iconPill" aria-label="Snapshot actions" role="group">
            <button
              type="button"
              className="footer__iconPillButton"
              onClick={onDownloadSnapshot}
              disabled={shareDisabled || shareBusy || !onDownloadSnapshot}
              title={shareDisabled ? shareDisabledReason ?? "Download unavailable" : "Download snapshot"}
              aria-label={shareBusy ? "Preparing snapshot" : "Download snapshot"}
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                download
              </span>
            </button>
            <button
              type="button"
              className="footer__iconPillButton"
              onClick={onShareSnapshot}
              disabled={shareDisabled || shareBusy || !onShareSnapshot}
              title={shareDisabled ? shareDisabledReason ?? "Share unavailable" : "Share snapshot"}
              aria-label={shareBusy ? "Preparing snapshot" : "Share snapshot"}
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                ios_share
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
