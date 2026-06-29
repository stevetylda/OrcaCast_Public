import type { ModelInfo } from "../data/dummyModels";

type Props = {
  selectedIds: string[];
  modelsById: Map<string, ModelInfo>;
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpenCompare: () => void;
  isDragActive: boolean;
  isDragOver: boolean;
  message?: string | null;
};

export function CompareTray({
  selectedIds,
  modelsById,
  onRemove,
  onClear,
  onOpenCompare,
  isDragActive,
  isDragOver,
  message,
}: Props) {
  const count = selectedIds.length;
  const compareDisabled = count < 2;

  const trayClassName = `compareTray ${count === 0 ? "compareTray--empty" : ""} ${
    isDragActive ? "isDragActive" : ""
  } ${isDragOver ? "isDragOver" : ""}`.trim();
  const hintText = isDragActive ? "Drop to add to Compare" : "Drag models here or tap + Compare.";

  return (
    <section
      className={trayClassName}
      aria-label="Compare tray"
    >
      <div className="compareTray__header">
        <div>
          <div className="compareTray__title">Compare ({count})</div>
          <div className={`compareTray__hint ${isDragActive ? "isDragActive" : ""}`}>{hintText}</div>
        </div>
        <div className="compareTray__actions">
          <button
            type="button"
            className="compareTray__btn compareTray__btn--ghost"
            onClick={onClear}
            disabled={count === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className={`compareTray__btn ${compareDisabled ? "" : "compareTray__btn--active"} ${
              count >= 2 ? "compareTray__btn--pulse" : ""
            }`}
            onClick={onOpenCompare}
            disabled={compareDisabled}
          >
            Compare
          </button>
        </div>
      </div>

      {message ? <div className="compareTray__message">{message}</div> : null}

      <div className="compareTray__pills" aria-live="polite">
        {count === 0 ? (
          <div className="compareTray__empty">No models selected yet.</div>
        ) : (
          selectedIds.map((id) => {
            const model = modelsById.get(id);
            if (!model) return null;
            return (
              <span className="compareTray__pill" key={id}>
                {model.name}
                <button
                  type="button"
                  className="compareTray__pillRemove"
                  onClick={() => onRemove(id)}
                  aria-label={`Remove ${model.name}`}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>
    </section>
  );
}
