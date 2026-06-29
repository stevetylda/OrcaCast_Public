import type { ExplainabilityView } from "../../features/explainability/types";

type Option = { key: ExplainabilityView; label: string; icon: string };

const OPTIONS: Option[] = [
  { key: "drivers", label: "Drivers", icon: "bolt" },
  { key: "interactions", label: "Interactions", icon: "hub" },
  { key: "window", label: "Window", icon: "schedule" },
  { key: "compare", label: "Compare", icon: "splitscreen" },
  { key: "movement", label: "Active Grids", icon: "moving" },
];

type Props = {
  value: ExplainabilityView;
  onChange: (value: ExplainabilityView) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function ExplainabilityToggle({
  value,
  onChange,
  orientation = "horizontal",
  className = "",
}: Props) {
  const activeIndex = OPTIONS.findIndex((option) => option.key === value);
  const isVertical = orientation === "vertical";
  const classes = `lineageViewToggle explainabilityToggle${
    isVertical ? " explainabilityToggle--vertical" : ""
  }${className ? ` ${className}` : ""}`;

  return (
    <div
      className={classes}
      role="tablist"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      aria-label="Explainability mode"
      onKeyDown={(event) => {
        const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";
        const nextKey = isVertical ? "ArrowDown" : "ArrowRight";
        if (event.key !== prevKey && event.key !== nextKey) return;
        event.preventDefault();
        const dir = event.key === nextKey ? 1 : -1;
        const nextIndex = (activeIndex + dir + OPTIONS.length) % OPTIONS.length;
        onChange(OPTIONS[nextIndex].key);
      }}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          title={isVertical ? option.label : undefined}
          data-label={isVertical ? option.label : undefined}
          aria-label={option.label}
          aria-selected={value === option.key}
          tabIndex={value === option.key ? 0 : -1}
          className={value === option.key ? "lineageViewToggle__option isActive" : "lineageViewToggle__option"}
          onClick={() => onChange(option.key)}
        >
          {isVertical ? (
            <span className="material-symbols-rounded explainabilityToggle__icon" aria-hidden="true">
              {option.icon}
            </span>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}
