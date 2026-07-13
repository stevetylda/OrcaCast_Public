import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ForecastMapHandle } from "../../map";
import { SuggestedPlacesPanel } from "./SuggestedPlacesPanel";

const place = {
  id: "lime-kiln",
  spotId: "lime-kiln-point-state-park",
  name: "Lime Kiln Point",
  region: "San Juan Island",
  type: "Park" as const,
  latitude: 48.515,
  longitude: -123.152,
  viewingPotential: "high" as const,
  score: 0.8,
  reason: "Strong forecast near accessible shoreline.",
};

describe("SuggestedPlacesPanel", () => {
  it("opens details and adds a recommended place to the itinerary", async () => {
    const user = userEvent.setup();
    const onSelectPlace = vi.fn();
    const onAddToItinerary = vi.fn();
    render(
      <SuggestedPlacesPanel
        places={[place]}
        selectedPlaceId={place.id}
        mapRef={createRef<ForecastMapHandle>()}
        open
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectPlace={onSelectPlace}
        onAddToItinerary={onAddToItinerary}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Lime Kiln Point" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add to itinerary" }));
    expect(onAddToItinerary).toHaveBeenCalledWith(place);
  });
});
