import "./ReferenceDataNotice.css";

export function ReferenceDataNotice({
  unavailable,
  onRetry,
}: {
  unavailable: string[];
  onRetry: () => void;
}) {
  if (!unavailable.length) return null;
  return (
    <aside className="referenceDataNotice" aria-label="Data availability">
      <p role="status">
        Some data is unavailable: {unavailable.join(", ")}. Available places and
        media remain usable.
      </p>
      <button type="button" onClick={onRetry}>
        Retry unavailable data
      </button>
    </aside>
  );
}
