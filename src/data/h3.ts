export type H3LikeProperties = Record<string, unknown>;

export const H3_CELL_ID_KEYS = [
  "h3",
  "H3",
  "h3_id",
  "H3_ID",
  "h3Index",
  "H3_INDEX",
  "cell_id",
  "CELL_ID",
] as const;

export function getH3CellId(props: H3LikeProperties | null | undefined): string {
  if (!props) return "";

  for (const key of H3_CELL_ID_KEYS) {
    const value = props[key];
    if (value != null) return String(value);
  }

  return "";
}
