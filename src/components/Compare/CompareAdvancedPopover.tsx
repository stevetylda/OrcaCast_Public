import type { CompareSettings } from "../../state/compareStore";

type Props = {
  open: boolean;
  settings: CompareSettings;
  onClose: () => void;
  onChange: (patch: Partial<CompareSettings>) => void;
};

export function CompareAdvancedPopover({ open, settings, onClose, onChange }: Props) {
  if (!open) return null;

  return (
    <div className="compareAdvancedPopover" role="dialog" aria-label="Advanced compare settings">
      <div className="compareAdvancedPopover__header">
        <strong>Advanced settings</strong>
        <button type="button" onClick={onClose} aria-label="Close advanced settings">
          ×
        </button>
      </div>

      <label className="compareAdvancedPopover__row">
        <span>Scale mode</span>
        <select
          value={settings.sharedScale ? "shared" : "separate"}
          onChange={(event) => onChange({ sharedScale: event.target.value === "shared" })}
        >
          <option value="shared">Shared</option>
          <option value="separate">Separate</option>
        </select>
      </label>

      <div className="compareAdvancedPopover__sectionTitle">Split mode</div>
      <label className="compareAdvancedPopover__checkbox">
        <input
          type="checkbox"
          checked={settings.syncDrag}
          onChange={(event) => onChange({ syncDrag: event.target.checked })}
        />
        Sync drag
      </label>
      <label className="compareAdvancedPopover__checkbox">
        <input
          type="checkbox"
          checked={settings.fixedSplit}
          onChange={(event) => onChange({ fixedSplit: event.target.checked })}
        />
        Fixed split
      </label>

      <div className="compareAdvancedPopover__sectionTitle">Overlay mode</div>
      <label className="compareAdvancedPopover__row">
        <span>Opacity ({settings.overlayOpacity.toFixed(2)})</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={settings.overlayOpacity}
          onChange={(event) => onChange({ overlayOpacity: Number(event.target.value) })}
        />
      </label>

      <label className="compareAdvancedPopover__checkbox">
        <input
          type="checkbox"
          checked={settings.showDelta}
          onChange={(event) => onChange({ showDelta: event.target.checked })}
        />
        Show Δ in selection readout
      </label>
    </div>
  );
}
