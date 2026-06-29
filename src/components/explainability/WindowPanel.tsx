import { useMemo, useState } from "react";
import type { DateWindow, GlobalImportanceRow, ShapSampleRow } from "../../features/explainability/types";
import {
  buildPresetWindow,
  clampWindow,
  computeGlobalImportanceFromSamples,
  convertSamplesForUnits,
  filterSamplesByWindow,
  toMonthLabel,
  uniqueSampleCount,
} from "../../features/explainability/utils";
import { ShapSummaryPlot } from "./plots";

type Props = {
  allSamples: ShapSampleRow[];
  allImportance: GlobalImportanceRow[];
  featureLabelByName: Map<string, string>;
  featureTypeByName: Map<string, string>;
  modelId: string;
  modelOptions: { value: string; label: string }[];
  onModelChange: (value: string) => void;
  minIso: string;
  maxIso: string;
  initialWindow: DateWindow;
  onWindowChange: (window: DateWindow) => void;
  onCompareToAllTime: () => void;
};

export function WindowPanel({
  allSamples,
  allImportance,
  featureLabelByName,
  featureTypeByName,
  modelId,
  modelOptions,
  onModelChange,
  minIso,
  maxIso,
  initialWindow,
  onWindowChange,
  onCompareToAllTime,
}: Props) {
  const [window, setWindow] = useState<DateWindow>(initialWindow);
  const [topN, setTopN] = useState(20);
  const [units, setUnits] = useState<"logit" | "probability">("probability");
  const presetOptions = useMemo(
    () => [
      { key: "last4w", label: "Last 4w", window: buildPresetWindow("last4w", minIso, maxIso) },
      { key: "last12w", label: "Last 12w", window: buildPresetWindow("last12w", minIso, maxIso) },
      { key: "year", label: "This year", window: buildPresetWindow("year", minIso, maxIso) },
      { key: "all", label: "All data", window: buildPresetWindow("all", minIso, maxIso) },
    ],
    [minIso, maxIso]
  );

  const clamped = useMemo(() => clampWindow(window, minIso, maxIso), [window, minIso, maxIso]);
  const filtered = useMemo(() => filterSamplesByWindow(allSamples, clamped), [allSamples, clamped]);
  const filteredForUnits = useMemo(() => convertSamplesForUnits(filtered, units), [filtered, units]);
  const allImportanceForUnits = useMemo(
    () => (units === "logit" ? allImportance : computeGlobalImportanceFromSamples(convertSamplesForUnits(allSamples, units))),
    [allImportance, allSamples, units]
  );
  const importance = useMemo(() => computeGlobalImportanceFromSamples(filteredForUnits), [filteredForUnits]);
  const n = useMemo(() => uniqueSampleCount(filtered), [filtered]);
  const maxAvailable = (importance.length > 0 ? importance : allImportanceForUnits).length;
  const topNOptions = [10, 20, 50];
  const highestAvailableTopN = topNOptions.filter((value) => value <= maxAvailable).at(-1) ?? topNOptions[0];
  const safeTopN =
    topNOptions.includes(topN) && (maxAvailable === 0 || topN <= maxAvailable)
      ? topN
      : highestAvailableTopN;
  const effectiveTopN = Math.min(safeTopN, maxAvailable || safeTopN);
  const activePresetKey =
    presetOptions.find((option) => option.window.start === clamped.start && option.window.end === clamped.end)?.key ?? "custom";

  const applyWindow = (next: DateWindow) => {
    const normalized = clampWindow(next, minIso, maxIso);
    setWindow(normalized);
    onWindowChange(normalized);
  };

  return (
    <section className="pageSection explainabilityPanel explainabilityPanel--window">
      <div className="explainabilityPanelSelectorDock" role="group" aria-label="Window controls">
        <label className="insightsExplorer__field">
          <select className="select" aria-label="Model" value={modelId} onChange={(event) => onModelChange(event.target.value)}>
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {`Model: ${option.label}`}
              </option>
            ))}
          </select>
        </label>
        <label className="insightsExplorer__field">
          <select className="select" aria-label="Top N drivers" value={safeTopN} onChange={(event) => setTopN(Number(event.target.value))}>
            {topNOptions.map((value) => (
              <option key={value} value={value} disabled={value > maxAvailable}>
                {value > maxAvailable ? `Top N: ${value} (unavailable)` : `Top N: ${value}`}
              </option>
            ))}
          </select>
        </label>
        <label className="insightsExplorer__field">
          <select
            className="select"
            aria-label="Impact units"
            value={units}
            onChange={(event) => setUnits(event.target.value as "logit" | "probability")}
          >
            <option value="logit">Impact: Logit</option>
            <option value="probability">Impact: Probability</option>
          </select>
        </label>
      </div>
      <div className="explainabilityPanel__head">
        <div className="explainabilityPanel__titleWrap">
          <div className="explainabilityPanel__titleRow">
            <h3>Drivers (Window)</h3>
          </div>
          <p className="driversSubcopy">
            Narrow the time slice, compare how the ranking shifts, and inspect the same SHAP view within a focused window.
          </p>
        </div>
      </div>

      <div className="explainabilityWindowComposer">
        <div className="explainabilityPanel__controls explainabilityPanel__controls--window">
          <label className="insightsExplorer__field">
            <span>Start</span>
            <input
              className="select"
              type="date"
              value={clamped.start}
              min={minIso}
              max={maxIso}
              onChange={(event) => applyWindow({ ...clamped, start: event.target.value })}
            />
          </label>
          <label className="insightsExplorer__field">
            <span>End</span>
            <input
              className="select"
              type="date"
              value={clamped.end}
              min={minIso}
              max={maxIso}
              onChange={(event) => applyWindow({ ...clamped, end: event.target.value })}
            />
          </label>
        </div>

        <div className="insightsExplorer__chips explainabilityWindowPresetRow" role="tablist" aria-label="Window presets">
          {presetOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={activePresetKey === option.key ? "pageToggle pageToggle--active" : "pageToggle"}
              onClick={() => applyWindow(option.window)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="explainabilityWindowBanner">
        <div className="explainabilityWindowBanner__eyebrow">
          <span className="explainabilityWindowBanner__tag">
            {activePresetKey === "custom" ? "Custom window" : presetOptions.find((option) => option.key === activePresetKey)?.label ?? "Window"}
          </span>
          <span className="explainabilityWindowBanner__meta">Sorted by mean(|impact|)</span>
        </div>
        <div className="explainabilityWindowBanner__range">
          {toMonthLabel(clamped.start)}
          {" -> "}
          {toMonthLabel(clamped.end)}
        </div>
        <div className="explainabilityWindowBanner__stats" role="list" aria-label="Window summary">
          <span className="explainabilityWindowBanner__chip" role="listitem">
            <strong>{n.toLocaleString()}</strong>
            <span>samples</span>
          </span>
          <span className="explainabilityWindowBanner__chip" role="listitem">
            <strong>{effectiveTopN}</strong>
            <span>visible drivers</span>
          </span>
          <span className="explainabilityWindowBanner__chip" role="listitem">
            <strong>{maxAvailable}</strong>
            <span>available features</span>
          </span>
        </div>
      </div>

      <ShapSummaryPlot
        samples={filteredForUnits}
        ranking={importance.length > 0 ? importance : allImportanceForUnits}
        topN={effectiveTopN}
        featureLabelByName={featureLabelByName}
        featureTypeByName={featureTypeByName}
        impactAxisLabel={units === "probability" ? "Impact (probability)" : "Impact (log-odds)"}
      />
      <p className="explainabilityPanel__foot">
        Window: {clamped.start}
        {" -> "}
        {clamped.end}
        {" | Top N: "}
        {effectiveTopN}
      </p>

      <div className="explainabilityPanel__actions">
        <button type="button" className="ghostBtn" onClick={onCompareToAllTime}>
          Compare to all-time
        </button>
      </div>
    </section>
  );
}
