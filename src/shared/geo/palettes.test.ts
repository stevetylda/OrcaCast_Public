import { describe, expect, it } from "vitest";
import { getPaletteOrDefault, PALETTES } from "./palettes";

describe("activity palettes", () => {
  it("only exposes the supported frontend color scales", () => {
    expect(Object.keys(PALETTES)).toEqual([
      "rose_noir",
      "basalt_fire",
      "cividis_safe",
      "mediterranean_atlas",
      "northern_lights",
      "forecast_lab",
      "forecast_lab_glow",
    ]);
  });

  it("falls back safely when a removed stored palette is encountered", () => {
    expect(getPaletteOrDefault("orcacast_classic").id).toBe(
      "mediterranean_atlas",
    );
  });
});
