import { useRef, type CSSProperties } from "react";
import { useDialogFocus } from "../../../shared/components/useDialogFocus";
import type { SuggestedPlace } from "../../locations/types";

type Props = {
  tripCityLabel: string;
  tripLabel: string;
  tripLengthLabel: string;
  itineraryPlaces: SuggestedPlace[];
  weekBars: { index: number; count: number; highlighted: boolean }[];
  weeklyChartColumnStyle: CSSProperties;
  weeklyChartMax: number;
  weeklyChartTicks: { index: number; label: string }[];
  handleItineraryDownloadAction: () => void;
  shareBusy: boolean;
  onClose: () => void;
};
export function PlannerItineraryDetails({
  tripCityLabel,
  tripLabel,
  tripLengthLabel,
  itineraryPlaces,
  weekBars,
  weeklyChartColumnStyle,
  weeklyChartMax,
  weeklyChartTicks,
  handleItineraryDownloadAction,
  shareBusy,
  onClose,
}: Props) {
  const itineraryUtilityDialogRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus({ open: true, dialogRef: itineraryUtilityDialogRef, onClose });
  return (
    <div
      ref={itineraryUtilityDialogRef}
      className="plannerResultsPage__itineraryUtilityModal"
      role="dialog"
      aria-modal="true"
      aria-label="Download itinerary details"
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="plannerResultsPage__itineraryUtilityPopover"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="plannerResultsPage__itineraryUtilityClose"
          onClick={onClose}
          aria-label="Close download itinerary dialog"
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            close
          </span>
        </button>
        <div className="plannerResultsPage__itineraryExportCardShell">
          <div className="plannerResultsPage__itineraryExportCard">
            <div className="plannerResultsPage__itineraryExportHeader">
              <h3>Orca Itinerary</h3>
            </div>
            <div className="plannerResultsPage__itineraryExportMeta">
              <div className="plannerResultsPage__itineraryExportMetaBlock">
                <span>From</span>
                <strong>{tripCityLabel}</strong>
              </div>
              <div className="plannerResultsPage__itineraryExportMetaBlock">
                <span>Date range</span>
                <strong>{tripLabel}</strong>
              </div>
              <div className="plannerResultsPage__itineraryExportMetaBlock">
                <span>Trip length</span>
                <strong>{tripLengthLabel}</strong>
              </div>
            </div>
            <div
              className="plannerResultsPage__itineraryExportRule"
              aria-hidden="true"
            />
            <div className="plannerResultsPage__itineraryExportStops">
              {itineraryPlaces.map((place, index) => (
                <div
                  key={`export-${place.id}`}
                  className="plannerResultsPage__itineraryExportStop"
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{`${place.name} (${place.latitude.toFixed(3)}, ${place.longitude.toFixed(3)})`}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="plannerResultsPage__itineraryExportRule"
              aria-hidden="true"
            />
            <div className="plannerResultsPage__itineraryExportChart">
              <div className="plannerResultsPage__itineraryExportChartTitle">
                Typical Sightings Per Week
              </div>
              <div
                className="plannerResultsPage__itineraryExportBars"
                style={weeklyChartColumnStyle}
              >
                {weekBars.map((bar) => (
                  <span
                    key={`export-bar-${bar.index}`}
                    className={`plannerResultsPage__itineraryExportBar${bar.highlighted ? " isHighlighted" : ""}`}
                    style={{
                      height: `${Math.max(8, (bar.count / weeklyChartMax) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <div
                className="plannerResultsPage__itineraryExportMonths"
                style={weeklyChartColumnStyle}
                aria-hidden="true"
              >
                {weeklyChartTicks.map((tick) => (
                  <span
                    key={`export-tick-${tick.index}`}
                    className="plannerResultsPage__itineraryExportMonth"
                    style={{
                      gridColumn: `${tick.index + 1} / span 1`,
                    }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="plannerResultsPage__itineraryUtilityAction"
          onClick={handleItineraryDownloadAction}
          disabled={shareBusy}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            download
          </span>
          <span>Download card</span>
        </button>
      </div>
    </div>
  );
}
