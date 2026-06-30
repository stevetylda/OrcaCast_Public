import type { GridDetailTab } from "./types";

type Props = {
  activeTab: GridDetailTab;
  onChange: (tab: GridDetailTab) => void;
};

const TAB_LABELS: Array<{ key: GridDetailTab; label: string }> = [
  { key: "forecast", label: "Forecast vs Actuals" },
  { key: "models", label: "Model Overlap" },
  { key: "spread", label: "Spread And Percentile" },
  { key: "neighbors", label: "Neighborhood" },
];

export function GridDetailTabs({ activeTab, onChange }: Props) {
  return (
    <div className="gridDetail__tabs" role="tablist" aria-label="Grid detail views">
      {TAB_LABELS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`gridDetail__tab${activeTab === tab.key ? " gridDetail__tab--active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
