import { useMemo, useState } from "react";
import type { DateWindow, ShapSampleRow } from "../../features/explainability/types";
import { computeCompareRows, toMonthLabel, uniqueSampleCount, filterSamplesByWindow } from "../../features/explainability/utils";
import { DeltaBarChart } from "./plots";

type Props = {
  allSamples: ShapSampleRow[];
  modelId: string;
  modelOptions: { value: string; label: string }[];
  onModelChange: (value: string) => void;
  minIso: string;
  maxIso: string;
  windowA: DateWindow;
  windowB: DateWindow;
  onWindowAChange: (window: DateWindow) => void;
  onWindowBChange: (window: DateWindow) => void;
};

export function ComparePanel({
  allSamples,
  modelId,
  modelOptions,
  onModelChange,
  minIso,
  maxIso,
  windowA,
  windowB,
  onWindowAChange,
  onWindowBChange,
}: Props) {
  const [a, setA] = useState<DateWindow>(windowA);
  const [b, setB] = useState<DateWindow>(windowB);

  const rows = useMemo(() => computeCompareRows(allSamples, a, b), [allSamples, a, b]);
  const nA = useMemo(() => uniqueSampleCount(filterSamplesByWindow(allSamples, a)), [allSamples, a]);
  const nB = useMemo(() => uniqueSampleCount(filterSamplesByWindow(allSamples, b)), [allSamples, b]);
  const topRow = rows[0] ?? null;

  const applyA = (next: DateWindow) => {
    setA(next);
    onWindowAChange(next);
  };

  const applyB = (next: DateWindow) => {
    setB(next);
    onWindowBChange(next);
  };

  return (
    <section className="pageSection explainabilityPanel explainabilityPanel--compare">
      <div className="explainabilityPanelSelectorDock explainabilityPanelSelectorDock--single" role="group" aria-label="Compare controls">
        <label className="insightsExplorer__field">
          <select className="select" aria-label="Model" value={modelId} onChange={(event) => onModelChange(event.target.value)}>
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {`Model: ${option.label}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="explainabilityPanel__head">
        <div className="explainabilityPanel__titleWrap">
          <div className="explainabilityPanel__titleRow">
            <h3>Compare driver shifts</h3>
          </div>
          <p className="driversSubcopy">
            Hold two time windows side by side to see which drivers gained or lost relative importance.
          </p>
        </div>
        <div className="explainabilityComparePickers">
          <div className="explainabilityComparePicker">
            <div className="explainabilityComparePicker__head">
              <strong>Window A</strong>
              <span className="explainabilityComparePicker__badge">{nA.toLocaleString()} samples</span>
            </div>
            <div className="explainabilityComparePicker__inputs">
              <input className="select" type="date" min={minIso} max={maxIso} value={a.start} onChange={(event) => applyA({ ...a, start: event.target.value })} />
              <input className="select" type="date" min={minIso} max={maxIso} value={a.end} onChange={(event) => applyA({ ...a, end: event.target.value })} />
            </div>
            <span className="explainabilityPanel__foot">
              {toMonthLabel(a.start)}
              {" -> "}
              {toMonthLabel(a.end)}
            </span>
          </div>
          <div className="explainabilityComparePicker">
            <div className="explainabilityComparePicker__head">
              <strong>Window B</strong>
              <span className="explainabilityComparePicker__badge">{nB.toLocaleString()} samples</span>
            </div>
            <div className="explainabilityComparePicker__inputs">
              <input className="select" type="date" min={minIso} max={maxIso} value={b.start} onChange={(event) => applyB({ ...b, start: event.target.value })} />
              <input className="select" type="date" min={minIso} max={maxIso} value={b.end} onChange={(event) => applyB({ ...b, end: event.target.value })} />
            </div>
            <span className="explainabilityPanel__foot">
              {toMonthLabel(b.start)}
              {" -> "}
              {toMonthLabel(b.end)}
            </span>
          </div>
        </div>
      </div>

      <div className="explainabilityCompareSummary" role="list" aria-label="Compare summary">
        <div className="explainabilityCompareSummary__card" role="listitem">
          <span className="explainabilityCompareSummary__label">Coverage</span>
          <strong className="explainabilityCompareSummary__value">
            {toMonthLabel(a.start)}
            {" -> "}
            {toMonthLabel(a.end)}
          </strong>
          <span className="explainabilityCompareSummary__detail">Window A baseline slice</span>
        </div>
        <div className="explainabilityCompareSummary__card" role="listitem">
          <span className="explainabilityCompareSummary__label">Coverage</span>
          <strong className="explainabilityCompareSummary__value">
            {toMonthLabel(b.start)}
            {" -> "}
            {toMonthLabel(b.end)}
          </strong>
          <span className="explainabilityCompareSummary__detail">Window B comparison slice</span>
        </div>
        <div className="explainabilityCompareSummary__card" role="listitem">
          <span className="explainabilityCompareSummary__label">Top shift</span>
          <strong className="explainabilityCompareSummary__value">
            {topRow ? topRow.feature_name : "No overlap"}
          </strong>
          <span className="explainabilityCompareSummary__detail">
            {topRow ? `Delta ${topRow.delta >= 0 ? "+" : ""}${topRow.delta.toFixed(4)}` : "No overlapping SHAP samples"}
          </span>
        </div>
      </div>

      <DeltaBarChart rows={rows} />

      <div className="insightsExplorer__tableWrap explainabilityCompareTableWrap">
        <table className="insightsExplorer__table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>A mean|SHAP|</th>
              <th>B mean|SHAP|</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row) => (
              <tr key={row.feature_name}>
                <td>{row.feature_name}</td>
                <td className="num">{row.a_mean_abs_shap.toFixed(4)}</td>
                <td className="num">{row.b_mean_abs_shap.toFixed(4)}</td>
                <td className={row.delta < 0 ? "is-neg num" : "is-pos num"}>{row.delta.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
