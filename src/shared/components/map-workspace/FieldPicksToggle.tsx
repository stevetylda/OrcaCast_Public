type Props = {
  count: number;
  onOpen: () => void;
  label: string;
  className?: string;
};

export function FieldPicksToggle({
  count,
  onOpen,
  label,
  className = "",
}: Props) {
  return (
    <button
      className={`mapWorkspacePicksToggle ${className}`}
      type="button"
      onClick={onOpen}
      aria-expanded="false"
      aria-label={label}
    >
      <img src="/images/icons/binoculars_recreated.svg" alt="" />
      <span>Field Picks</span>
      <strong>{count}</strong>
      <span className="material-symbols-rounded" aria-hidden="true">
        expand_less
      </span>
    </button>
  );
}
