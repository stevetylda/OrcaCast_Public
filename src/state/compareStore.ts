export type CompareViewMode = "split" | "overlay";
export type CompareLensMode = "locked" | "swipe";

export type CompareSettings = {
  mode: CompareViewMode;
  lensMode: CompareLensMode;
  dualMapMode: boolean;
  sharedScale: boolean;
  syncDrag: boolean;
  fixedSplit: boolean;
  overlayOpacity: number;
  showDelta: boolean;
  splitPct: number;
};

export const DEFAULT_COMPARE_SETTINGS: CompareSettings = {
  mode: "split",
  lensMode: "swipe",
  dualMapMode: false,
  sharedScale: false,
  syncDrag: true,
  fixedSplit: true,
  overlayOpacity: 0.5,
  showDelta: false,
  splitPct: 50,
};
