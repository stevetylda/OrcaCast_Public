import {
  NO_DATA_COLOR,
  ZERO_COLOR,
  type HeatScale,
} from "../../../shared/geo/colorScale";

type Props = {
  scale?: HeatScale | null;
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
  binRange:
    | {
        percentileMin: number;
        percentileMax: number;
        probMin: number;
        probMax: number;
      }
    | undefined,
): string {
  if (!binRange) return label;
  const pMinPct = formatPercentile(binRange.percentileMin);
  const pMaxPct = formatPercentile(binRange.percentileMax);
  const pMin = formatProbability(binRange.probMin);
  const pMax = formatProbability(binRange.probMax);
  return `${label} = ${pMinPct}-${pMaxPct}th percentile (or p=${pMin}-${pMax})`;
}

export function ProbabilityLegend({ scale }: Props) {
  if (!scale) return null;
  const { binColorsRgba, labels, binRanges, zeroColor, noDataColor } = scale;
  const nonZeroLabels = labels.slice(1, 1 + binColorsRgba.length);

  return (
    <div
      className="legend"
      role="img"
      aria-label="Probability legend"
      data-tour="legend"
    >
      <div className="legend__header">
        <div className="legend__title">Sighting Outlook</div>
      </div>
      <div className="legend__list">
        <div
          className="legend__row legend__row--hasTooltip"
          data-tooltip="This cell is outside the selected model's published support."
          tabIndex={0}
        >
          <span
            className="legend__swatch"
            style={{ background: noDataColor ?? NO_DATA_COLOR }}
          />
          <div className="legend__label">No model coverage</div>
        </div>
        <div
          className="legend__row legend__row--hasTooltip"
          data-tooltip="The model published a probability of zero for this cell."
          tabIndex={0}
        >
          <span
            className="legend__swatch"
            style={{ background: zeroColor ?? ZERO_COLOR }}
          />
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
      <div className="legend__note">
        Relative likelihoods binned within week.
      </div>
    </div>
  );
}
