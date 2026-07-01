import { useMemo } from "react";

const PRESET_VALUES = [0.1, 0.5, 1, 2, 5];

type Props = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  mode: "modeled" | "custom";
  onModeChange: (value: "modeled" | "custom") => void;
  percentile: number;
  onPercentileChange: (value: number) => void;
  totalCells: number | null;
  modeledCount: number | null;
};

export function HotspotsSettingsSection({
  enabled,
  onEnabledChange,
  mode,
  onModeChange,
  percentile,
  onPercentileChange,
  totalCells,
  modeledCount,
}: Props) {
  const showingCount = useMemo(() => {
    if (mode !== "custom" || !totalCells) return null;
    return Math.max(1, Math.round((totalCells * percentile) / 100));
  }, [mode, totalCells, percentile]);

  return (
    <section className="hotspotsSettings">
      <div className="hotspotsSettings__header">
        <div className="hotspotsSettings__title">
          <span className="material-symbols-rounded hotspotsSettings__icon">local_fire_department</span>
          <span>Hotspots</span>
        </div>
        <button
          type="button"
          className={`hotspotSwitch${enabled ? " hotspotSwitch--on" : ""}`}
          onClick={() => onEnabledChange(!enabled)}
          aria-pressed={enabled}
          aria-label={`Hotspots ${enabled ? "on" : "off"}`}
        >
          <span className="hotspotSwitch__knob" />
        </button>
      </div>

      <div className="hotspotsSettings__mode" role="group" aria-label="Hotspot mode">
        <button
          type="button"
          className={mode === "modeled" ? "hotspotSegment hotspotSegment--active" : "hotspotSegment"}
          onClick={() => onModeChange("modeled")}
          aria-pressed={mode === "modeled"}
        >
          Modeled
        </button>
        <button
          type="button"
          className={mode === "custom" ? "hotspotSegment hotspotSegment--active" : "hotspotSegment"}
          onClick={() => onModeChange("custom")}
          aria-pressed={mode === "custom"}
        >
          Custom
        </button>
      </div>

      {mode === "custom" && (
        <div className="hotspotsSettings__custom">
          <div className="hotspotsSettings__chips" role="listbox" aria-label="Hotspot presets">
            {PRESET_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={value === percentile ? "hotspotChip hotspotChip--active" : "hotspotChip"}
                onClick={() => onPercentileChange(value)}
                aria-pressed={value === percentile}
              >
                {value}%
              </button>
            ))}
          </div>
          <div className="hotspotsSettings__feedback">
            {showingCount ? `Showing: ${showingCount.toLocaleString()} cells` : "Showing: —"}
          </div>
        </div>
      )}

      {mode === "modeled" && (
        <div className="hotspotsSettings__feedback">
          {modeledCount && modeledCount > 0
            ? `Showing: ${Math.round(modeledCount).toLocaleString()} cells`
            : "Showing: —"}
        </div>
      )}
    </section>
  );
}
