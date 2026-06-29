import type { CompareViewMode } from "../../state/compareStore";

type Props = {
  mode: CompareViewMode;
  onSwap: () => void;
  onToggleMode: () => void;
  onOpenAdvanced: () => void;
};

export function CompareDividerPill({ mode, onSwap, onToggleMode, onOpenAdvanced }: Props) {
  return (
    <div className="compareDividerPill" role="toolbar" aria-label="Comparison controls">
      <button type="button" className="compareDividerPill__btn" onClick={onSwap}>
        A ⇄ B
      </button>
      <button type="button" className="compareDividerPill__btn" onClick={onToggleMode}>
        {mode === "split" ? "Split" : "Overlay"}
      </button>
      <button
        type="button"
        className="compareDividerPill__btn compareDividerPill__btn--icon"
        onClick={onOpenAdvanced}
        aria-label="Open advanced settings"
      >
        ⋯
      </button>
    </div>
  );
}
