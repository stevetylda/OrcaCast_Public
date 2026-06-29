import { useMemo, useRef, useState } from "react";
import { FeatureDependencePlot, type DependenceRow, ShapSummaryPlot } from "./plots";
import type { GlobalImportanceRow, ShapSampleRow } from "../../features/explainability/types";
import {
  computeGlobalImportanceFromSamples,
  convertSamplesForUnits,
  uniqueSampleCount,
} from "../../features/explainability/utils";

type Props = {
  samples: ShapSampleRow[];
  globalImportance: GlobalImportanceRow[];
  featureLabelByName: Map<string, string>;
  featureTypeByName: Map<string, string>;
  modelId: string;
  modelOptions: Array<{ value: string; label: string }>;
  onModelChange: (value: string) => void;
};

type GroupKey = "baseline" | "static" | "temporal" | "spicy" | "other";

const GROUP_OPTIONS: Array<{ key: GroupKey; label: string }> = [
  { key: "baseline", label: "Baselines" },
  { key: "static", label: "Static geography" },
  { key: "temporal", label: "Temporal memory" },
  { key: "spicy", label: "Spicy covariates" },
  { key: "other", label: "Other" },
];
const PRIMARY_GROUPS: GroupKey[] = ["baseline", "static", "temporal"];

function normalizeGroup(raw: string | undefined, featureName: string, displayName: string): GroupKey {
  const combined = `${raw ?? ""} ${featureName} ${displayName}`.toLowerCase();
  if (combined.includes("climat") || combined.includes("baseline") || combined.includes("regime")) return "baseline";
  if (
    combined.includes("distance") ||
    combined.includes("shore") ||
    combined.includes("water") ||
    combined.includes("spatial")
  ) {
    return "static";
  }
  if (combined.includes("lag") || combined.includes("rolling") || combined.includes("streak") || combined.includes("temporal")) {
    return "temporal";
  }
  if (combined.includes("ais") || combined.includes("human") || combined.includes("prey") || combined.includes("noise")) {
    return "spicy";
  }
  return "other";
}

function pearsonCorrelation(pairs: Array<{ x: number; y: number }>): number {
  if (pairs.length < 3) return 0;
  const n = pairs.length;
  const sumX = pairs.reduce((acc, p) => acc + p.x, 0);
  const sumY = pairs.reduce((acc, p) => acc + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const pair of pairs) {
    const dx = pair.x - meanX;
    const dy = pair.y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (!Number.isFinite(den) || den <= 1e-12) return 0;
  return num / den;
}

function directionFromCorrelation(corr: number): "high_raises" | "high_lowers" | "mixed" {
  if (Math.abs(corr) < 0.15) return "mixed";
  return corr > 0 ? "high_raises" : "high_lowers";
}

function volatilityFromStdDev(stdDev: number): "low" | "medium" | "high" {
  if (stdDev <= 2) return "low";
  if (stdDev <= 4) return "medium";
  return "high";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function takeEvery<T>(rows: T[], maxItems: number): T[] {
  if (rows.length <= maxItems) return rows;
  const stride = Math.ceil(rows.length / maxItems);
  const out: T[] = [];
  for (let idx = 0; idx < rows.length; idx += stride) out.push(rows[idx]);
  return out;
}

export function DriversPanel({
  samples,
  globalImportance,
  featureLabelByName,
  featureTypeByName,
  modelId,
  modelOptions,
  onModelChange,
}: Props) {
  const driversPlotSectionRef = useRef<HTMLElement | null>(null);
  const [topN, setTopN] = useState(20);
  const [units, setUnits] = useState<"logit" | "probability">("probability");
  const [infoOpen, setInfoOpen] = useState(false);
  const [renderMode, setRenderMode] = useState<"dense" | "crisp">("dense");
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [colorByFeature, setColorByFeature] = useState<string>("__none");
  const [showDependenceTrend, setShowDependenceTrend] = useState(true);
  const [showDependenceBand, setShowDependenceBand] = useState(true);
  const [activeGroups, setActiveGroups] = useState<Set<GroupKey>>(
    () => new Set<GroupKey>(["baseline", "static", "temporal", "spicy", "other"])
  );

  const unitSamples = useMemo(() => convertSamplesForUnits(samples, units), [samples, units]);
  const sorted = useMemo(
    () =>
      units === "logit"
        ? [...globalImportance].sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
        : computeGlobalImportanceFromSamples(unitSamples),
    [globalImportance, unitSamples, units]
  );
  const featureGroupByName = useMemo(() => {
    const map = new Map<string, GroupKey>();
    for (const row of sorted) {
      const display = featureLabelByName.get(row.feature_name) ?? row.feature_name;
      map.set(row.feature_name, normalizeGroup(featureTypeByName.get(row.feature_name), row.feature_name, display));
    }
    return map;
  }, [sorted, featureLabelByName, featureTypeByName]);

  const groupFilteredSorted = useMemo(
    () => sorted.filter((row) => activeGroups.has(featureGroupByName.get(row.feature_name) ?? "other")),
    [sorted, activeGroups, featureGroupByName]
  );
  const groupFeatureSet = useMemo(() => new Set(groupFilteredSorted.map((row) => row.feature_name)), [groupFilteredSorted]);
  const groupFilteredSamples = useMemo(
    () => unitSamples.filter((row) => groupFeatureSet.has(row.feature_name)),
    [unitSamples, groupFeatureSet]
  );

  const monthlyImportance = useMemo(() => {
    const byMonth = new Map<string, ShapSampleRow[]>();
    for (const row of groupFilteredSamples) {
      const month = row.time.slice(0, 7);
      const list = byMonth.get(month) ?? [];
      list.push(row);
      byMonth.set(month, list);
    }
    const monthlyRanks = new Map<string, Map<string, number>>();
    for (const [month, rows] of byMonth) {
      const importance = computeGlobalImportanceFromSamples(rows);
      const rankByFeature = new Map<string, number>();
      importance.forEach((item, idx) => {
        rankByFeature.set(item.feature_name, idx + 1);
      });
      monthlyRanks.set(month, rankByFeature);
    }
    return monthlyRanks;
  }, [groupFilteredSamples]);

  const baseMaxAvailable = groupFilteredSorted.length;
  const topNOptions = [10, 20, 50];
  const highestAvailableTopN = topNOptions.filter((value) => value <= baseMaxAvailable).at(-1) ?? topNOptions[0];
  const safeTopN =
    topNOptions.includes(topN) && (baseMaxAvailable === 0 || topN <= baseMaxAvailable)
      ? topN
      : highestAvailableTopN;

  const stabilityByFeature = useMemo(() => {
    const months = [...monthlyImportance.keys()];
    const out = new Map<string, { stable: boolean; stdDev: number; topShare: number; tag: "low" | "medium" | "high" }>();
    for (const row of groupFilteredSorted) {
      const ranks = months
        .map((month) => monthlyImportance.get(month)?.get(row.feature_name))
        .filter((rank): rank is number => Number.isFinite(rank));
      if (ranks.length === 0) {
        out.set(row.feature_name, { stable: false, stdDev: Number.POSITIVE_INFINITY, topShare: 0, tag: "high" });
        continue;
      }
      const mean = average(ranks);
      const variance = average(ranks.map((rank) => (rank - mean) ** 2));
      const stdDev = Math.sqrt(variance);
      const topShare = ranks.filter((rank) => rank <= Math.max(1, Math.min(safeTopN, baseMaxAvailable))).length / ranks.length;
      const stable = topShare >= 0.7 && stdDev <= 2.5;
      out.set(row.feature_name, { stable, stdDev, topShare, tag: volatilityFromStdDev(stdDev) });
    }
    return out;
  }, [groupFilteredSorted, monthlyImportance, safeTopN, baseMaxAvailable]);

  const rankedForView = groupFilteredSorted;

  const maxAvailable = rankedForView.length;
  const effectiveTopN = Math.min(safeTopN, maxAvailable || safeTopN);
  const rankedTop = rankedForView.slice(0, effectiveTopN);
  const rankedTopSet = useMemo(() => new Set(rankedTop.map((row) => row.feature_name)), [rankedTop]);
  const effectiveSelectedFeature =
    selectedFeature && rankedTopSet.has(selectedFeature)
      ? selectedFeature
      : (rankedTop[0]?.feature_name ?? null);

  const rowsByFeature = useMemo(() => {
    const map = new Map<string, ShapSampleRow[]>();
    for (const row of groupFilteredSamples) {
      const list = map.get(row.feature_name) ?? [];
      list.push(row);
      map.set(row.feature_name, list);
    }
    return map;
  }, [groupFilteredSamples]);

  const summaryTop3 = useMemo(
    () =>
      rankedTop.slice(0, 3).map((row) => {
        const rows = rowsByFeature.get(row.feature_name) ?? [];
        const corr = pearsonCorrelation(
          rows
            .filter((item) => item.feature_value != null && Number.isFinite(Number(item.feature_value)))
            .map((item) => ({ x: Number(item.feature_value), y: item.shap_value }))
        );
        const direction = directionFromCorrelation(corr);
        const uniqueN = uniqueSampleCount(rows);
        return {
          feature: row.feature_name,
          direction,
          n: uniqueN,
          volatility: stabilityByFeature.get(row.feature_name)?.tag ?? "high",
        };
      }),
    [rankedTop, rowsByFeature, stabilityByFeature]
  );

  const colorByOptions = useMemo(
    () => rankedTop.slice(0, 10).map((row) => row.feature_name),
    [rankedTop]
  );
  const effectiveColorByFeature =
    colorByFeature !== "__none" && colorByOptions.includes(colorByFeature)
      ? colorByFeature
      : (colorByOptions.find((feature) => feature !== effectiveSelectedFeature) ?? "__none");

  const sampleFeatureMatrix = useMemo(() => {
    const bySample = new Map<string, { time: string; byFeature: Map<string, { value: number | null; shap: number }> }>();
    for (const row of groupFilteredSamples) {
      const current = bySample.get(row.sample_id) ?? { time: row.time, byFeature: new Map() };
      current.time = row.time;
      current.byFeature.set(row.feature_name, { value: row.feature_value ?? null, shap: row.shap_value });
      bySample.set(row.sample_id, current);
    }
    return bySample;
  }, [groupFilteredSamples]);

  const dependenceRows = useMemo<DependenceRow[]>(() => {
    if (!effectiveSelectedFeature) return [];
    const rows: DependenceRow[] = [];
    for (const [sampleId, sample] of sampleFeatureMatrix) {
      const selected = sample.byFeature.get(effectiveSelectedFeature);
      if (!selected || selected.value == null || !Number.isFinite(selected.value)) continue;
      const colorValue =
        effectiveColorByFeature === "__none"
          ? null
          : (sample.byFeature.get(effectiveColorByFeature)?.value ?? null);
      rows.push({
        sample_id: sampleId,
        time: sample.time,
        x: Number(selected.value),
        y: selected.shap,
        color: colorValue != null && Number.isFinite(colorValue) ? Number(colorValue) : null,
      });
    }
    return takeEvery(rows, 7000);
  }, [sampleFeatureMatrix, effectiveSelectedFeature, effectiveColorByFeature]);

  const takeaway = useMemo(() => {
    if (!effectiveSelectedFeature || dependenceRows.length < 12) {
      return "Not enough samples for a stable directional takeaway yet.";
    }
    const corr = pearsonCorrelation(dependenceRows.map((row) => ({ x: row.x, y: row.y })));
    const base =
      Math.abs(corr) < 0.12
        ? "Impact looks mixed across this feature range."
        : corr > 0
          ? "Higher values tend to increase predicted presence."
          : "Lower values tend to increase predicted presence.";

    const summer = dependenceRows.filter((row) => {
      const month = Number(row.time.slice(5, 7));
      return month >= 6 && month <= 9;
    });
    const nonSummer = dependenceRows.filter((row) => {
      const month = Number(row.time.slice(5, 7));
      return month < 6 || month > 9;
    });
    const summerMean = average(summer.map((row) => row.y));
    const nonSummerMean = average(nonSummer.map((row) => row.y));
    const seasonalDelta = summerMean - nonSummerMean;
    const seasonal =
      Math.abs(seasonalDelta) < 0.02
        ? ""
        : seasonalDelta > 0
          ? " The effect is stronger in summer weeks."
          : " The effect is stronger outside summer weeks.";
    return `${base}${seasonal}`;
  }, [effectiveSelectedFeature, dependenceRows]);

  const toggleGroup = (group: GroupKey) => {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleFeatureSelect = (featureName: string) => {
    setSelectedFeature(featureName);
    setDrilldownOpen(true);
  };

  const handleTopDriverClick = (featureName: string) => {
    setSelectedFeature(featureName);
    driversPlotSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="pageSection explainabilityPanel explainabilityPanel--drivers">
      <div className="explainabilityDriversSelectorDock" role="group" aria-label="Drivers controls">
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
              <option key={value} value={value} disabled={value > baseMaxAvailable}>
                {value > baseMaxAvailable ? `Top N: ${value} (unavailable)` : `Top N: ${value}`}
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
            <h3>Drivers (All-time)</h3>
            <button
              type="button"
              className="driversInfoButton"
              aria-label="What are SHAP drivers?"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((prev) => !prev)}
            >
              i
            </button>
          </div>
          <p className="driversSubcopy">
            Drivers rank which features most influence predictions overall, using mean absolute SHAP impact.
          </p>
          {infoOpen && (
            <aside className="driversInfoPopover" role="note">
              <p>SHAP explains model drivers - what pushes predictions up/down vs a baseline. (Not causal.)</p>
              <ul>
                <li>Positive impact pushes predictions higher; negative lowers them.</li>
                <li>Color shows the feature's value (low to high).</li>
                <li>Explains the model's behavior, not real-world causation.</li>
              </ul>
            </aside>
          )}
        </div>
      </div>

      <section className="explainabilitySectionBlock" aria-label="Top 3 drivers">
        <h4 className="explainabilitySectionTitle">Top 3 Drivers</h4>
        <div className="explainabilityDriversSummary" aria-label="Top drivers summary">
          {summaryTop3.map((item, idx) => {
            const label = featureLabelByName.get(item.feature) ?? item.feature;
            const effectChipLabel =
              item.direction === "high_raises"
                ? "↑ raises"
                : item.direction === "high_lowers"
                  ? "↓ lowers"
                  : "↕ mixed";
            const effectChipClass =
              item.direction === "high_raises"
                ? "isRaise"
                : item.direction === "high_lowers"
                  ? "isLower"
                  : "isMixed";
            return (
              <button
                type="button"
                key={item.feature}
                className={
                  effectiveSelectedFeature === item.feature
                    ? "explainabilityDriversSummary__card explainabilityDriversSummary__card--active"
                    : "explainabilityDriversSummary__card"
                }
                onClick={() => handleTopDriverClick(item.feature)}
                aria-label={`Select ${label} in SHAP drivers`}
              >
                <div className="explainabilityDriversSummary__rank">{idx + 1}</div>
                <div className="explainabilityDriversSummary__body">
                  <strong>{label}</strong>
                </div>
                <span className={`explainabilityDriversSummary__effectChip ${effectChipClass}`}>{effectChipLabel}</span>
              </button>
            );
          })}
          {summaryTop3.length === 0 && <p className="pageNote">No drivers match current filters.</p>}
        </div>
      </section>

      <section ref={driversPlotSectionRef} className="explainabilitySectionBlock" aria-label="SHAP drivers">
        <h4 className="explainabilitySectionTitle">SHAP Drivers</h4>
        <div className="explainabilityDriversPlotCard">
          <div className="explainabilityPlotFilters" role="group" aria-label="Primary driver groups">
            {GROUP_OPTIONS.filter((group) => PRIMARY_GROUPS.includes(group.key)).map((group) => {
              const hasAny = sorted.some((row) => (featureGroupByName.get(row.feature_name) ?? "other") === group.key);
              const active = activeGroups.has(group.key);
              return (
                <button
                  key={group.key}
                  type="button"
                  disabled={!hasAny}
                  className={active ? "explainabilityGroupToggle isActive" : "explainabilityGroupToggle"}
                  onClick={() => toggleGroup(group.key)}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
          <ShapSummaryPlot
            samples={groupFilteredSamples}
            ranking={rankedForView}
            topN={effectiveTopN}
            featureLabelByName={featureLabelByName}
            featureTypeByName={featureTypeByName}
            impactAxisLabel={units === "probability" ? "Impact (probability)" : "Impact (log-odds)"}
            renderMode={renderMode}
            onRenderModeChange={setRenderMode}
            selectedFeature={effectiveSelectedFeature}
            onFeatureSelect={handleFeatureSelect}
          />
        </div>
      </section>

      {effectiveSelectedFeature && drilldownOpen && (
        <section className="explainabilitySectionBlock" aria-label="SHAP dependence">
          <h4 className="explainabilitySectionTitle">SHAP Depedence</h4>
          <section className="explainabilityDrilldown explainabilityDependenceCard">
          <div className="explainabilityDrilldown__head">
            <div>
              <h4>{featureLabelByName.get(effectiveSelectedFeature) ?? effectiveSelectedFeature}</h4>
              <p>Dependence plot and narrative takeaway for the selected driver.</p>
            </div>
            <button type="button" className="ghostBtn" onClick={() => setDrilldownOpen(false)}>
              Close
            </button>
            <button
              type="button"
              className={showDependenceTrend ? "pageToggle pageToggle--active" : "pageToggle"}
              onClick={() => setShowDependenceTrend((prev) => !prev)}
            >
              Trend
            </button>
            <button
              type="button"
              className={showDependenceBand ? "pageToggle pageToggle--active" : "pageToggle"}
              onClick={() => setShowDependenceBand((prev) => !prev)}
            >
              IQR band
            </button>
            <label className="insightsExplorer__field">
              <span>Colored by</span>
              <select className="select" value={effectiveColorByFeature} onChange={(event) => setColorByFeature(event.target.value)}>
                <option value="__none">None</option>
                {colorByOptions
                  .filter((feature) => feature !== effectiveSelectedFeature)
                  .map((feature) => (
                    <option key={feature} value={feature}>
                      {featureLabelByName.get(feature) ?? feature}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <FeatureDependencePlot
            rows={dependenceRows}
            xLabel={`${featureLabelByName.get(effectiveSelectedFeature) ?? effectiveSelectedFeature} value`}
            colorLabel={effectiveColorByFeature === "__none" ? "None" : featureLabelByName.get(effectiveColorByFeature) ?? effectiveColorByFeature}
            showTrend={showDependenceTrend}
            showBand={showDependenceBand}
          />
          <p className="explainabilityDrilldown__takeaway">{takeaway}</p>
          </section>
        </section>
      )}
    </section>
  );
}
