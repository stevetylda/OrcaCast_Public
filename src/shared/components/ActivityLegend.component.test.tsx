import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PALETTES } from "../geo/palettes";
import { ActivityLegend } from "./ActivityLegend";

describe("ActivityLegend", () => {
  it("renders the shared likelihood scale and selects a palette", async () => {
    const onOpenChange = vi.fn();
    const onPaletteSelect = vi.fn();
    const { container } = render(
      <ActivityLegend
        colors={["#001", "#123", "#345", "#456", "#678", "#789", "#fff"]}
        open
        onOpenChange={onOpenChange}
        onPaletteSelect={onPaletteSelect}
        palettes={Object.values(PALETTES)}
        selectedPaletteId="forecast_lab"
      />,
    );

    expect(screen.getByText("Activity likelihood")).toBeVisible();
    expect(screen.getByText("Lower")).toBeVisible();
    expect(screen.getByText("Higher")).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Mediterranean Atlas" }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(".activityLegend__ramp > span"),
    ).toHaveLength(5);
    for (const swatches of container.querySelectorAll(
      ".activityLegend__paletteSwatches",
    )) {
      expect(swatches.children).toHaveLength(5);
    }
    await userEvent.click(screen.getByRole("option", { name: "Rose Noir" }));
    expect(onPaletteSelect).toHaveBeenCalledWith("rose_noir");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
