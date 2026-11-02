import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlannerItineraryDetails } from "./PlannerItineraryDetails";
it("preserves dialog focus, escape dismissal, and download behavior", () => {
  const onClose = vi.fn();
  const download = vi.fn();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const { unmount } = render(
    <PlannerItineraryDetails
      tripCityLabel="Seattle"
      tripLabel="Sep 13–15"
      tripLengthLabel="3 days"
      itineraryPlaces={[]}
      weekBars={[]}
      weeklyChartColumnStyle={{}}
      weeklyChartMax={1}
      weeklyChartTicks={[]}
      handleItineraryDownloadAction={download}
      shareBusy={false}
      onClose={onClose}
    />,
  );
  const dialog = screen.getByRole("dialog", {
    name: "Download itinerary details",
  });
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Download card" }));
  expect(download).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
