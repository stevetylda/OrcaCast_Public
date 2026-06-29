import { ZERO_COLOR, type HeatScale } from "../map/colorScale";
import type { DeltaLegendSpec } from "../map/deltaMap";

type Props = {
  scale?: HeatScale | null;
  deltaLegend?: DeltaLegendSpec | null;
};

function formatPercentile(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatProbability(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 0.1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(3);
  return value.toFixed(4);
}

function buildBinTooltip(
  label: string,
  binRange: { percentileMin: number; percentileMax: number; probMin: number; probMax: number } | undefined
): string {
  if (!binRange) return label;
  const pMinPct = formatPercentile(binRange.percentileMin);
  const pMaxPct = formatPercentile(binRange.percentileMax);
  const pMin = formatProbability(binRange.probMin);
  const pMax = formatProbability(binRange.probMax);
  return `${label} = ${pMinPct}-${pMaxPct}th percentile (or p=${pMin}-${pMax})`;
}

function DeltaLegend({ spec }: { spec: DeltaLegendSpec }) {
  const gradient = `linear-gradient(90deg, ${spec.colors.join(", ")})`;
  return (
    <div className="legend" aria-label="Delta legend" data-tour="legend">
      <div className="legend__header">
        <div className="legend__title">{spec.title}</div>
      </div>
      <div className="legend__deltaBar" style={{ background: gradient }} />
      <div className="legend__deltaTicks" aria-hidden="true">
        <span>{spec.minLabel}</span>
        <span>{spec.midLabel}</span>
        <span>{spec.maxLabel}</span>
      </div>
      <div className="legend__deltaHints" aria-hidden="true">
        <span>{spec.minHint}</span>
        <span>{spec.maxHint}</span>
      </div>
      <div className="legend__note">{spec.note}</div>
    </div>
  );
}

export function ProbabilityLegend({ scale, deltaLegend }: Props) {
  if (deltaLegend) {
    return <DeltaLegend spec={deltaLegend} />;
  }
  if (!scale) return null;
  const { binColorsRgba, labels, binRanges } = scale;
  const nonZeroLabels = labels.slice(1, 1 + binColorsRgba.length);

  return (
    <div className="legend" aria-label="Probability legend" data-tour="legend">
      <div className="legend__header">
        <div className="legend__title">Sighting Outlook</div>
      </div>
      <div className="legend__list">
        <div
          className="legend__row legend__row--hasTooltip"
          data-tooltip="No probability observed for this cell in the selected week (p=0)."
          tabIndex={0}
        >
          <span className="legend__swatch" style={{ background: ZERO_COLOR }} />
          <div className="legend__label">{labels[0]}</div>
        </div>

        {nonZeroLabels.map((label, idx) => {
          const swatch = binColorsRgba[Math.min(idx, binColorsRgba.length - 1)];
          const tooltip = buildBinTooltip(label, binRanges[idx]);
          return (
            <div
              key={`${label}-${idx}`}
              className="legend__row legend__row--hasTooltip"
              data-tooltip={tooltip}
              tabIndex={0}
            >
              <span className="legend__swatch" style={{ background: swatch }} />
              <div className="legend__label">{label}</div>
            </div>
          );
        })}
      </div>
      <div className="legend__note">Relative likelihoods binned within week.</div>
    </div>
  );
}
