import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PLANNER_ITINERARY_STORAGE_KEY } from "./itineraryStorage";
import { usePersistedItinerary } from "./usePersistedItinerary";

function Harness({ page }: { page: "Watch" | "Planner" }) {
  const { itineraryPlaceIds, setItineraryPlaceIds } = usePersistedItinerary();
  return (
    <div>
      <output aria-label={`${page} itinerary`}>
        {itineraryPlaceIds.join(",")}
      </output>
      <button
        type="button"
        onClick={() => setItineraryPlaceIds((current) => [...current, "first"])}
      >
        Add first
      </button>
      <button
        type="button"
        onClick={() =>
          setItineraryPlaceIds((current) => [...current, "second"])
        }
      >
        Add second
      </button>
      <button
        type="button"
        onClick={() =>
          setItineraryPlaceIds((current) => [...current].reverse())
        }
      >
        Reverse
      </button>
      <button type="button" onClick={() => setItineraryPlaceIds([])}>
        Remove all
      </button>
    </div>
  );
}

describe("usePersistedItinerary", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("persists add, reorder, route continuity, and empty removal", async () => {
    const user = userEvent.setup();
    const watch = render(<Harness page="Watch" />);
    await user.click(screen.getByRole("button", { name: "Add first" }));
    await user.click(screen.getByRole("button", { name: "Add second" }));
    await user.click(screen.getByRole("button", { name: "Reverse" }));
    expect(screen.getByLabelText("Watch itinerary")).toHaveTextContent(
      "second,first",
    );
    watch.unmount();

    render(<Harness page="Planner" />);
    expect(screen.getByLabelText("Planner itinerary")).toHaveTextContent(
      "second,first",
    );
    await user.click(screen.getByRole("button", { name: "Remove all" }));
    expect(
      window.sessionStorage.getItem(PLANNER_ITINERARY_STORAGE_KEY),
    ).toBeNull();
  });
});
