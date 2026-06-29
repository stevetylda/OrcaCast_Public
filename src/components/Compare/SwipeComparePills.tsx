import type { ModelInfo } from "../../features/models/data/dummyModels";
import type { H3Resolution } from "../../config/dataPaths";
import { H3ResolutionPill } from "../controls/H3ResolutionPill";
import { OrcaDropdown, type OrcaDropdownItem } from "../ui/OrcaDropdown";

type Props = {
  modelLeftId: string;
  modelRightId: string;
  periodLeft: string;
  periodRight: string;
  resolutionLeft: H3Resolution;
  resolutionRight: H3Resolution;
  dualMapMode: boolean;
  deltaMode: boolean;
  periodOptions: string[];
  models: ModelInfo[];
  onChangeModelLeft: (id: string) => void;
  onChangeModelRight: (id: string) => void;
  onChangePeriodLeft: (period: string) => void;
  onChangePeriodRight: (period: string) => void;
  onChangeResolutionLeft: (resolution: H3Resolution) => void;
  onChangeResolutionRight: (resolution: H3Resolution) => void;
  onToggleLocked: () => void;
  onToggleDeltaMode: () => void;
};

function formatModelLabel(value: string): string {
  return value
    .split("_")
    .map((part) => {
      const lowered = part.toLowerCase();
      if (lowered === "srkw") return "SRKW";
      if (lowered === "kw") return "KW";
      if (lowered === "idw") return "IDW";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function SwipeComparePills({
  modelLeftId,
  modelRightId,
  periodLeft,
  periodRight,
  resolutionLeft,
  resolutionRight,
  dualMapMode,
  deltaMode,
  periodOptions,
  models,
  onChangeModelLeft,
  onChangeModelRight,
  onChangePeriodLeft,
  onChangePeriodRight,
  onChangeResolutionLeft,
  onChangeResolutionRight,
  onToggleLocked,
  onToggleDeltaMode,
}: Props) {
  const safeLeftModelId = modelLeftId || models[0]?.id || "";
  const safeRightModelId = modelRightId || models[0]?.id || "";
  const safePeriodLeft = periodLeft || periodOptions[0] || "";
  const safePeriodRight = periodRight || periodOptions[0] || "";

  const leftModelExists = models.some((model) => model.id === safeLeftModelId);
  const rightModelExists = models.some((model) => model.id === safeRightModelId);
  const leftPeriodExists = periodOptions.includes(safePeriodLeft);
  const rightPeriodExists = periodOptions.includes(safePeriodRight);
  const lockIsActive = dualMapMode && !deltaMode;
  const leftModelLabel =
    models.find((model) => model.id === safeLeftModelId)?.name ??
    formatModelLabel(safeLeftModelId);
  const rightModelLabel =
    models.find((model) => model.id === safeRightModelId)?.name ??
    formatModelLabel(safeRightModelId);

  const leftModelItems: OrcaDropdownItem[] = [
    ...(!leftModelExists && safeLeftModelId
      ? [{ id: safeLeftModelId, label: formatModelLabel(safeLeftModelId) }]
      : []),
    ...models.map((model) => ({ id: model.id, label: model.name })),
  ];

  const rightModelItems: OrcaDropdownItem[] = [
    ...(!rightModelExists && safeRightModelId
      ? [{ id: safeRightModelId, label: formatModelLabel(safeRightModelId) }]
      : []),
    ...models.map((model) => ({ id: model.id, label: model.name })),
  ];

  const sortedPeriodOptions = [...periodOptions].reverse();

  const leftPeriodItems: OrcaDropdownItem[] = [
    ...(!leftPeriodExists && safePeriodLeft ? [{ id: safePeriodLeft, label: safePeriodLeft }] : []),
    ...sortedPeriodOptions.map((option) => ({ id: option, label: option })),
  ];

  const rightPeriodItems: OrcaDropdownItem[] = [
    ...(!rightPeriodExists && safePeriodRight ? [{ id: safePeriodRight, label: safePeriodRight }] : []),
    ...sortedPeriodOptions.map((option) => ({ id: option, label: option })),
  ];

  return (
    <div className="swipeComparePills" aria-label="Swipe compare lenses">
      <div className="swipeComparePills__surface">
        <div className="swipeComparePills__summary" aria-hidden="true">
          <span className="swipeComparePills__summaryItem">A - {leftModelLabel}</span>
          <span className="swipeComparePills__summaryItem">B - {rightModelLabel}</span>
        </div>
        <div className="swipeComparePills__grid">
          <div className="swipeComparePills__lane">
            <div className="swipeComparePills__field swipeComparePills__field--modelDropdown">
              <OrcaDropdown
                label="Model"
                valueLabel={leftModelLabel}
                items={leftModelItems}
                selectedId={safeLeftModelId}
                onSelect={onChangeModelLeft}
                ariaLabel={`Left model: ${leftModelLabel}`}
                triggerClassName="swipeComparePills__dropdownTrigger swipeComparePills__dropdownTrigger--model"
                menuClassName="swipeComparePills__dropdownMenu swipeComparePills__dropdownMenu--model"
              />
            </div>

            <div className="swipeComparePills__field swipeComparePills__field--periodDropdown">
              <OrcaDropdown
                valueLabel={safePeriodLeft}
                items={leftPeriodItems}
                selectedId={safePeriodLeft}
                onSelect={onChangePeriodLeft}
                ariaLabel={`Left period: ${safePeriodLeft}`}
                iconOnly
                showChevron={false}
                iconLeft={
                  <span className="material-symbols-rounded" aria-hidden="true">
                    calendar_month
                  </span>
                }
                minMenuWidth={240}
                matchTriggerWidth={false}
                triggerClassName="swipeComparePills__dropdownTrigger swipeComparePills__dropdownTrigger--period"
                menuClassName="swipeComparePills__dropdownMenu swipeComparePills__dropdownMenu--period"
              />
            </div>

            <div className="swipeComparePills__resolution" aria-label="Left hex resolution">
              <H3ResolutionPill
                value={resolutionLeft === "H4" ? 4 : resolutionLeft === "H5" ? 5 : 6}
                onChange={(next) =>
                  onChangeResolutionLeft(next === 4 ? "H4" : next === 5 ? "H5" : "H6")
                }
                compact
              />
            </div>
            <div className="swipeComparePills__field swipeComparePills__field--modelDropdown">
              <OrcaDropdown
                label="Model"
                valueLabel={rightModelLabel}
                items={rightModelItems}
                selectedId={safeRightModelId}
                onSelect={onChangeModelRight}
                ariaLabel={`Right model: ${rightModelLabel}`}
                triggerClassName="swipeComparePills__dropdownTrigger swipeComparePills__dropdownTrigger--model"
                menuClassName="swipeComparePills__dropdownMenu swipeComparePills__dropdownMenu--model"
              />
            </div>

            <div className="swipeComparePills__field swipeComparePills__field--periodDropdown">
              <OrcaDropdown
                valueLabel={safePeriodRight}
                items={rightPeriodItems}
                selectedId={safePeriodRight}
                onSelect={onChangePeriodRight}
                ariaLabel={`Right period: ${safePeriodRight}`}
                iconOnly
                showChevron={false}
                iconLeft={
                  <span className="material-symbols-rounded" aria-hidden="true">
                    calendar_month
                  </span>
                }
                minMenuWidth={240}
                matchTriggerWidth={false}
                triggerClassName="swipeComparePills__dropdownTrigger swipeComparePills__dropdownTrigger--period"
                menuClassName="swipeComparePills__dropdownMenu swipeComparePills__dropdownMenu--period"
              />
            </div>

            <div className="swipeComparePills__resolution" aria-label="Right hex resolution">
              <H3ResolutionPill
                value={resolutionRight === "H4" ? 4 : resolutionRight === "H5" ? 5 : 6}
                onChange={(next) =>
                  onChangeResolutionRight(next === 4 ? "H4" : next === 5 ? "H5" : "H6")
                }
                disabled={deltaMode}
                compact
              />
            </div>
          </div>

          <div className="swipeComparePills__tools" role="toolbar" aria-label="Compare tools">
            <button
              type="button"
              className={`iconBtn swipeComparePills__toolBtn${lockIsActive ? " isActive" : ""}`}
              onClick={onToggleLocked}
              aria-label="Lock"
              aria-pressed={lockIsActive}
              disabled={deltaMode}
              data-tooltip={
                deltaMode
                  ? "Lock disabled in delta mode"
                  : dualMapMode
                    ? "Locked: dual-map compare"
                    : "Unlock: single-map swipe"
              }
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                {lockIsActive ? "lock" : "lock_open"}
              </span>
            </button>
            <button
              type="button"
              className={`iconBtn swipeComparePills__toolBtn swipeComparePills__toolBtn--delta${deltaMode ? " isActive" : ""}`}
              onClick={onToggleDeltaMode}
              aria-label="Delta map"
              aria-pressed={deltaMode}
              data-tooltip={"Delta map (relative hotspot shift)\nShows change in percentile rank: A − B"}
            >
              <span className="swipeComparePills__deltaGlyph" aria-hidden="true">
                Δ
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
