export type PaletteId =
  | "rose_noir"
  | "basalt_fire"
  | "cividis_safe"
  | "mediterranean_atlas"
  | "northern_lights"
  | "forecast_lab"
  | "forecast_lab_glow";

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
  forecast_lab: {
    id: "forecast_lab",
    name: "Forecast Lab",
    colors: ["#E8F4F1", "#B9E4DF", "#76CFCA", "#38A9AA", "#176F7D", "#0C1C3A"],
    dominant: "#38A9AA",
  },
  forecast_lab_glow: {
    id: "forecast_lab_glow",
    name: "Forecast Lab Glow",
    colors: ["#0C1C3A", "#288E99", "#76CFCA", "#B9DCB6", "#F8D769", "#FFF4C8"],
    dominant: "#76CFCA",
  },
};

export const VIEWABILITY_ONLY_PALETTES: Record<
  ViewabilityOnlyPaletteId,
  PaletteDef<ViewabilityOnlyPaletteId>
> = {
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
  ...Object.values(PALETTES),
  ...Object.values(VIEWABILITY_ONLY_PALETTES),
];

export function getPalette(paletteId: PaletteId): PaletteDef {
  return PALETTES[paletteId];
}

export function getPaletteOrDefault(
  paletteId: string | null | undefined,
): PaletteDef {
  if (!paletteId) return PALETTES[DEFAULT_PALETTE_ID];
  return PALETTES[paletteId as PaletteId] ?? PALETTES[DEFAULT_PALETTE_ID];
}

export function getViewabilityPaletteOrDefault(
  paletteId: string | null | undefined,
): PaletteDef<ViewabilityPaletteId> {
  if (!paletteId) return PALETTES.mediterranean_atlas;
  return (
    PALETTES[paletteId as PaletteId] ??
    VIEWABILITY_ONLY_PALETTES[paletteId as ViewabilityOnlyPaletteId] ??
    PALETTES.mediterranean_atlas
  );
}

if (import.meta.env.DEV) {
  [
    ...Object.values(PALETTES),
    ...Object.values(VIEWABILITY_ONLY_PALETTES),
  ].forEach((palette) => {
    if (palette.colors.length < 2) {
      const message = `[palettes] Palette "${palette.id}" must define at least 2 colors, got ${palette.colors.length}.`;

      console.warn(message);
      throw new Error(message);
    }
  });
}
