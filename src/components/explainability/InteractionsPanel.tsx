import { useMemo, useState } from "react";
import type { InteractionRankingRow, InteractionSampleRow } from "../../features/explainability/types";
import { mergeSymmetricInteractionRanking } from "../../features/explainability/utils";
import { InteractionScatterPlot } from "./plots";

type Props = {
  supported: boolean;
  ranking: InteractionRankingRow[];
  samples: InteractionSampleRow[];
  modelId: string;
  modelOptions: { value: string; label: string }[];
  onModelChange: (value: string) => void;
};

export function InteractionsPanel({ supported, ranking, samples, modelId, modelOptions, onModelChange }: Props) {
  const [mode, setMode] = useState<"effect" | "interaction">("effect");

  const normalizedRanking = useMemo(() => mergeSymmetricInteractionRanking(ranking), [ranking]);
  const [selectedPair, setSelectedPair] = useState<string>(
    normalizedRanking[0] ? `${normalizedRanking[0].feature_a}::${normalizedRanking[0].feature_b}` : ""
  );

  const effectiveSelectedPair =
    selectedPair || (normalizedRanking[0] ? `${normalizedRanking[0].feature_a}::${normalizedRanking[0].feature_b}` : "");

  const selectedSamples = useMemo(() => {
    if (!effectiveSelectedPair) return [];
    const [a, b] = effectiveSelectedPair.split("::");
    return samples.filter(
      (row) => (row.feature_a === a && row.feature_b === b) || (row.feature_a === b && row.feature_b === a)
    );
  }, [samples, effectiveSelectedPair]);

  if (!supported) {
    return (
      <section className="pageSection explainabilityPanel explainabilityPanel--interactions">
        <div className="explainabilityPanelSelectorDock explainabilityPanelSelectorDock--single" role="group" aria-label="Interactions controls">
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
        <h3>Interactions</h3>
        <div className="explainabilityEmptyState">
          Interactions are available for tree models (XGBoost/LightGBM).
        </div>
      </section>
    );
  }

  return (
    <section className="explainabilityInteractionsGrid">
      <section className="pageSection explainabilityPanel explainabilityPanel--interactions">
        <h3>Interaction ranking</h3>
        <div className="explainabilityPairList" role="listbox" aria-label="Top interaction pairs">
          {normalizedRanking.slice(0, 50).map((row, index, rows) => {
            const key = `${row.feature_a}::${row.feature_b}`;
            const active = key === effectiveSelectedPair;
            const strongestInteraction = rows[0]?.mean_abs_interaction ?? 0;
            const barWidth = strongestInteraction > 0 ? `${Math.max((row.mean_abs_interaction / strongestInteraction) * 100, 8)}%` : "0%";
            return (
              <button
                type="button"
                key={key}
                className={active ? "explainabilityPairList__item explainabilityPairList__item--active" : "explainabilityPairList__item"}
                onClick={() => setSelectedPair(key)}
                title={`${row.feature_a} × ${row.feature_b}`}
              >
                <span className="explainabilityPairList__rank" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="explainabilityPairList__content">
                  <span className="explainabilityPairList__pair">
                    <span className="explainabilityPairList__feature" title={row.feature_a}>
                      {row.feature_a}
                    </span>
                    <span className="explainabilityPairList__operator" aria-hidden="true">
                      ×
                    </span>
                    <span className="explainabilityPairList__feature" title={row.feature_b}>
                      {row.feature_b}
                    </span>
                  </span>
                  <span className="explainabilityPairList__bar" aria-hidden="true">
                    <span className="explainabilityPairList__barFill" style={{ width: barWidth }} />
                  </span>
                </span>
                <strong className="explainabilityPairList__score">{row.mean_abs_interaction.toFixed(4)}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pageSection explainabilityPanel explainabilityPanel--interactions">
        <div className="explainabilityPanelSelectorDock explainabilityPanelSelectorDock--single" role="group" aria-label="Interactions controls">
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
          <div className="explainabilityPanel__titleRow">
            <h3>Interaction plot</h3>
            <span className="explainabilityInfoWrap">
              <button type="button" className="explainabilityInfoDot" aria-label="How to read the interaction plot">
                i
              </button>
              <span className="explainabilityInfoHelp" role="note">
                The x-axis shows the first feature&apos;s value. The y-axis shows either that feature&apos;s SHAP effect or the
                pair&apos;s interaction value, depending on the selected mode. Each point is one sample, and color shows the
                second feature&apos;s value.
              </span>
            </span>
          </div>
          <div className="insightsExplorer__unitToggle">
            <button
              type="button"
              className={mode === "effect" ? "pageToggle pageToggle--active" : "pageToggle"}
              onClick={() => setMode("effect")}
            >
              Effect
            </button>
            <button
              type="button"
              className={mode === "interaction" ? "pageToggle pageToggle--active" : "pageToggle"}
              onClick={() => setMode("interaction")}
            >
              Interaction value
            </button>
          </div>
        </div>
        <InteractionScatterPlot rows={selectedSamples} mode={mode} />
      </section>
    </section>
  );
}
