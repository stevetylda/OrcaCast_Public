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

function setMobileViewport(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query === "(max-width: 760px)" ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("SuggestedPlacesPanel", () => {
  it("shows only a playback spinner instead of field picks while playing", () => {
    render(
      <SuggestedPlacesPanel
        places={[]}
        selectedPlaceId={null}
        isPlaybackActive
        mapRef={createRef<ForecastMapHandle>()}
        open
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectPlace={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Playing weekly forecast" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("group", { name: "Filter recommended places" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

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

  it("shows watch locations nearest the modeled area first and can return to recommendations", async () => {
    const user = userEvent.setup();
    const onShowRecommendedPlaces = vi.fn();
    render(
      <SuggestedPlacesPanel
        places={[place]}
        selectedPlaceId={null}
        viewMode="watch"
        webcams={[
          {
            id: "far-camera",
            name: "Far webcam",
            region: "North Coast",
            locality: "Far Away",
            waterbody: "Pacific Ocean",
            latitude: 51,
            longitude: -128,
            coordinateQuality: "Approximate",
            priorityScore: 80,
            feeds: [],
          },
          {
            id: "near-camera",
            name: "Near webcam",
            region: "San Juan Island",
            locality: "Friday Harbor",
            waterbody: "Haro Strait",
            latitude: 48.52,
            longitude: -123.15,
            coordinateQuality: "Approximate",
            priorityScore: 90,
            feeds: [],
          },
        ]}
        mapRef={createRef<ForecastMapHandle>()}
        open
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectPlace={vi.fn()}
        onShowRecommendedPlaces={onShowRecommendedPlaces}
      />,
    );

    const locationButtons = screen
      .getAllByRole("button")
      .filter((button) =>
        button.classList.contains("suggestedPlacesPanel__mediaCard"),
      );
    expect(locationButtons[0]).toHaveTextContent("Near webcam");
    expect(locationButtons[1]).toHaveTextContent("Far webcam");

    await user.click(
      screen.getByRole("button", { name: "Back to recommended places" }),
    );
    expect(onShowRecommendedPlaces).toHaveBeenCalledTimes(1);
  });

  it("shows five mobile recommendations initially and can reveal all 25", async () => {
    setMobileViewport(true);
    const user = userEvent.setup();
    const places = Array.from({ length: 25 }, (_, index) => ({
      ...place,
      id: `place-${index + 1}`,
      name: `Place ${index + 1}`,
    }));
    render(
      <SuggestedPlacesPanel
        places={places}
        selectedPlaceId={null}
        mapRef={createRef<ForecastMapHandle>()}
        open
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectPlace={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("article")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show all 25" }));
    expect(screen.getAllByRole("article")).toHaveLength(25);
  });
});
