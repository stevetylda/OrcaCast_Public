import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppFooter } from "./AppFooter";

describe("AppFooter location views", () => {
  it("routes Watch and Listen into the shared locations panel", async () => {
    const onOpenWatchLocations = vi.fn();
    const onOpenListenLocations = vi.fn();
    render(
      <AppFooter
        webcamCount={2}
        hydrophoneCount={5}
        onOpenWatchLocations={onOpenWatchLocations}
        onOpenListenLocations={onOpenListenLocations}
        unitsMode="imperial"
        onUnitsModeChange={vi.fn()}
        surfaceMode="grid"
        onSurfaceModeChange={vi.fn()}
        poiFilters={{ Park: false, Marina: false, Ferry: false }}
        onTogglePoiAll={vi.fn()}
        onTogglePoiType={vi.fn()}
        selectedPaletteId="mediterranean_atlas"
        onPaletteChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Watch" }));
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));

    expect(onOpenWatchLocations).toHaveBeenCalledTimes(1);
    expect(onOpenListenLocations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
