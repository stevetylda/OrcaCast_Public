import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PALETTES } from "../geo/palettes";
import { ActivityLegend } from "./ActivityLegend";

describe("ActivityLegend", () => {
  it("renders the shared likelihood scale and selects a palette", async () => {
    const onOpenChange = vi.fn();
    const onPaletteSelect = vi.fn();
    render(
      <ActivityLegend
        colors={["#001", "#123", "#456", "#789", "#fff"]}
        open
        onOpenChange={onOpenChange}
        onPaletteSelect={onPaletteSelect}
        palettes={Object.values(PALETTES)}
        selectedPaletteId="mediterranean_atlas"
      />,
    );

    expect(screen.getByText("Activity likelihood")).toBeVisible();
    expect(screen.getByText("Lower")).toBeVisible();
    expect(screen.getByText("Higher")).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: "Rose Noir" }));
    expect(onPaletteSelect).toHaveBeenCalledWith("rose_noir");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
