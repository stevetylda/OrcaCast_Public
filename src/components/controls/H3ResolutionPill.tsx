import { useMemo } from "react";
import { StackedHexIcon } from "../icons/StackedHexIcon";

export type H3Res = 4 | 5 | 6;

type Option = {
  res: H3Res;
  label: string;
  shortLabel: string;
  tooltip: string;
};

const OPTIONS: Option[] = [
  {
    res: 4,
    label: "Regional",
    shortLabel: "Regional",
    tooltip: "Regional (H4) — large regions / overview",
  },
  {
    res: 5,
    label: "Sub-Regional",
    shortLabel: "Sub-Regional",
    tooltip: "Sub-Regional (H5) — balanced detail",
  },
  {
    res: 6,
    label: "Local",
    shortLabel: "Local",
    tooltip: "Local (H6) — fine detail / small regions",
  },
];

type Props = {
  value: H3Res;
  onChange: (next: H3Res) => void;
  disabled?: boolean;
  compact?: boolean;
  tourId?: string;
};

export function H3ResolutionPill({
  value,
  onChange,
  disabled = false,
  compact = true,
  tourId,
}: Props) {
  const activeIndex = useMemo(
    () => Math.max(0, OPTIONS.findIndex((opt) => opt.res === value)),
    [value]
  );

  const label = OPTIONS[activeIndex]?.tooltip;

  return (
    <div
      className={`h3menu${compact ? " h3menu--compact" : ""}${disabled ? " h3menu--disabled" : ""}`}
      data-tour={tourId}
    >
      <button
        type="button"
        className="h3menu__trigger"
        onClick={() => {
          if (disabled) return;
          const nextIndex = (activeIndex + 1) % OPTIONS.length;
          const next = OPTIONS[nextIndex]?.res;
          if (next !== undefined && next !== value) onChange(next);
        }}
        disabled={disabled}
        aria-label="Resolution"
        title={label}
      >
        <StackedHexIcon selected={value} size={40} />
      </button>
    </div>
  );
}
