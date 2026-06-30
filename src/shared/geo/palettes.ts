export type PaletteId =
  | "orcacast_classic"
  | "amethyst"
  | "rose_noir"
  | "basalt_fire"
  | "cividis_safe"
  | "forest_greens"
  | "mediterranean_atlas"
  | "red_atlas"
  | "northern_lights";

export type ViewabilityOnlyPaletteId = "relief_atlas";

export type ViewabilityPaletteId = PaletteId | ViewabilityOnlyPaletteId;

export type PaletteDef<TId extends string = PaletteId> = {
  id: TId;
  name: string;
  colors: string[];
  dominant: string;
};

export const DEFAULT_PALETTE_ID: PaletteId = "mediterranean_atlas";

export const PALETTES: Record<PaletteId, PaletteDef> = {
  orcacast_classic: {
    id: "orcacast_classic",
    name: "OrcaCast Classic",
    colors: [
      "#002BFB",
      "#0466FF",
      "#049FFF",
      "#00CEFD",
      "#00E1EB",
      "#00EBB6",
      "#00EBDD",
      "#C1FFFA",
    ],
    dominant: "#00E1EB",
  },
  amethyst: {
    id: "amethyst",
    name: "Amethyst",
    colors: [
      "#10002B",
      "#240046",
      "#3C096C",
      "#5A189A",
      "#7B2CBF",
      "#9D4EDD",
      "#C77DFF",
      "#E0AAFF",
    ],
    dominant: "#9D4EDD",
  },
  rose_noir: {
    id: "rose_noir",
    name: "Rose Noir",
    colors: [
      "#590D22",
      "#800F2F",
      "#A4133C",
      "#C9184A",
      "#FF4D6D",
      "#FF758F",
      "#FF8FA3",
      "#FFCCD5",
    ],
    dominant: "#FF4D6D",
  },
  basalt_fire: {
    id: "basalt_fire",
    name: "Basalt & Fire",
    colors: [
      "#03071E",
      "#370617",
      "#6A040F",
      "#9D0208",
      "#D00000",
      "#E85D04",
      "#F48C06",
      "#FFBA08",
    ],
    dominant: "#E85D04",
  },
  cividis_safe: {
    id: "cividis_safe",
    name: "Cividis Safe",
    colors: [
      "#00204C",
      "#283A90",
      "#3F5597",
      "#556F8E",
      "#6F8A7E",
      "#8FA56B",
      "#BCCB4C",
      "#FDE945",
    ],
    dominant: "#8FA56B",
  },
  forest_greens: {
    id: "forest_greens",
    name: "Forest Greens",
    colors: [
      "#081C15",
      "#1B4332",
      "#2D6A4F",
      "#3C7A5E",
      "#4F936D",
      "#74A57F",
      "#95BC8F",
      "#B7D8A6",
    ],
    dominant: "#4F936D",
  },
  mediterranean_atlas: {
    id: "mediterranean_atlas",
    name: "Mediterranean Atlas",
    colors: [
      "#D7E1DF",
      "#B8CCCE",
      "#8EB5BD",
      "#5AA0AE",
      "#278AA2",
      "#0B718D",
      "#075672",
      "#08364F",
    ],
    dominant: "#0B718D",
  },
  red_atlas: {
    id: "red_atlas",
    name: "Red Atlas",
    colors: [
      "#E5DAD6",
      "#D6BBB3",
      "#C89589",
      "#B86F62",
      "#A74E45",
      "#8F332F",
      "#6D2427",
      "#451A22",
    ],
    dominant: "#A74E45",
  },
  northern_lights: {
    id: "northern_lights",
    name: "Northern Lights",
    colors: [
      "#071326",
      "#102A43",
      "#124E66",
      "#167A7A",
      "#1FBF9A",
      "#79E0C5",
      "#A7F3D0",
      "#D9FFF3",
    ],
    dominant: "#1FBF9A",
  },
};

export const VIEWABILITY_ONLY_PALETTES: Record<ViewabilityOnlyPaletteId, PaletteDef<ViewabilityOnlyPaletteId>> = {
  relief_atlas: {
    id: "relief_atlas",
    name: "Relief Atlas",
    colors: [
      "#F7F4E8",
      "#E8DFC4",
      "#D8C077",
      "#B98D4F",
      "#B8C6C2",
      "#86ADB0",
      "#4E8F94",
      "#1F6670",
    ],
    dominant: "#4E8F94",
  },
};

export const VIEWABILITY_PALETTE_OPTIONS: PaletteDef<ViewabilityPaletteId>[] = [
  ...Object.values(PALETTES).filter((palette) => palette.id !== "orcacast_classic"),
  ...Object.values(VIEWABILITY_ONLY_PALETTES),
];

export function getPalette(paletteId: PaletteId): PaletteDef {
  return PALETTES[paletteId];
}

export function getPaletteOrDefault(paletteId: string | null | undefined): PaletteDef {
  if (!paletteId) return PALETTES[DEFAULT_PALETTE_ID];
  return PALETTES[paletteId as PaletteId] ?? PALETTES[DEFAULT_PALETTE_ID];
}

export function getViewabilityPaletteOrDefault(paletteId: string | null | undefined): PaletteDef<ViewabilityPaletteId> {
  if (!paletteId) return PALETTES.mediterranean_atlas;
  return (
    PALETTES[paletteId as PaletteId] ??
    VIEWABILITY_ONLY_PALETTES[paletteId as ViewabilityOnlyPaletteId] ??
    PALETTES.mediterranean_atlas
  );
}

if (import.meta.env.DEV) {
  [...Object.values(PALETTES), ...Object.values(VIEWABILITY_ONLY_PALETTES)].forEach((palette) => {
    if (palette.colors.length !== 8) {
      const message = `[palettes] Palette "${palette.id}" must define exactly 8 colors, got ${palette.colors.length}.`;
       
      console.warn(message);
      throw new Error(message);
    }
  });
}
