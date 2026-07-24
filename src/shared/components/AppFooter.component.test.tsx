import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WebcamSite } from "../../features/locations/types";
import { AppFooter } from "./AppFooter";

const webcams: WebcamSite[] = [
  {
    id: "single",
    name: "Single webcam",
    region: "Haro Strait",
    locality: "San Juan Island",
    waterbody: "Haro Strait",
    latitude: 48.5,
    longitude: -123.1,
    coordinateQuality: "Approximate site",
    priorityScore: 90,
    liveCameraUrl: "https://example.com/single",
    feeds: [
      {
        id: "single-feed",
        name: "Single webcam",
        operator: "Operator",
        accessUrl: "https://example.com/single",
        feedFormat: "Live video",
        status: "verified-current",
        verifiedAt: "2026-07-17",
        tier: 1,
        priorityScore: 90,
      },
    ],
  },
  {
    id: "multi",
    name: "Multi webcam site",
    region: "Discovery Passage",
    locality: "Campbell River",
    waterbody: "Discovery Passage",
    latitude: 50,
    longitude: -125.2,
    coordinateQuality: "Approximate pier",
    priorityScore: 97,
    liveCameraUrl: "https://example.com/north",
    feeds: [
      {
        id: "north",
        name: "North view",
        operator: "Operator",
        accessUrl: "https://example.com/north",
        feedFormat: "Live video",
        status: "verified-current",
        verifiedAt: "2026-07-17",
        tier: 1,
        priorityScore: 97,
      },
      {
        id: "south",
        name: "South view",
        operator: "Operator",
        accessUrl: "https://example.com/south",
        feedFormat: "Live video",
        status: "verified-current",
        verifiedAt: "2026-07-17",
        tier: 1,
        priorityScore: 95,
      },
    ],
  },
];

describe("AppFooter webcams", () => {
  it("lists grouped webcam sites and selects a site", async () => {
    const onSelectCamera = vi.fn();
    render(
      <AppFooter
        webcams={webcams}
        selectedCameraId="multi"
        onSelectCamera={onSelectCamera}
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
    expect(screen.getByText("Webcams")).toBeInTheDocument();
    expect(screen.getByText("2 views")).toBeInTheDocument();
    const multi = screen.getByRole("button", { name: /Multi webcam site/ });
    expect(multi).toHaveClass("isSelected");
    await userEvent.click(multi);
    expect(onSelectCamera).toHaveBeenCalledWith(webcams[1]);
  });
});
