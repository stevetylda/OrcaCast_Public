type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export function ExplainabilityResolutionToggle({ value, options, onChange }: Props) {
  const hexSizeByResolution: Record<string, number> = {
    H4: 18,
    H5: 14,
    H6: 10,
  };

  return (
    <div
      className="lineageViewToggle explainabilityToggle explainabilityResolutionToggle"
      role="tablist"
      aria-label="Explainability resolution"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const enabledOptions = options.filter((option) => !option.disabled);
        if (enabledOptions.length === 0) return;
        const enabledIndex = enabledOptions.findIndex((option) => option.value === value);
        const currentEnabledIndex = enabledIndex >= 0 ? enabledIndex : 0;
        const dir = event.key === "ArrowRight" ? 1 : -1;
        const nextEnabledIndex = (currentEnabledIndex + dir + enabledOptions.length) % enabledOptions.length;
        onChange(enabledOptions[nextEnabledIndex].value);
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? "lineageViewToggle__option isActive" : "lineageViewToggle__option"}
          onClick={() => onChange(option.value)}
          disabled={option.disabled}
        >
          <span
            className="explainabilityResolutionToggle__hex"
            aria-hidden="true"
            style={{
              width: `${hexSizeByResolution[option.value] ?? 14}px`,
              height: `${hexSizeByResolution[option.value] ?? 14}px`,
            }}
          />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
