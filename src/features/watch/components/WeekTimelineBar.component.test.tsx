import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Period } from "../../../shared/data/periods";
import { WeekTimelineBar } from "./WeekTimelineBar";

const periods: Period[] = [23, 24, 25].map((week) => ({
  year: 2026,
  stat_week: week,
  label: `Week ${week}`,
  periodKey: `2026-${week}`,
  fileId: `2026_${week}`,
}));

function TimelineHarness() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  return (
    <WeekTimelineBar
      periods={periods}
      selectedIndex={selectedIndex}
      onChangeIndex={setSelectedIndex}
      isPlaying={isPlaying}
      onPlayingChange={setIsPlaying}
    />
  );
}

describe("WeekTimelineBar", () => {
  it("plays forward through the week boxes and stops at the end", async () => {
    vi.useFakeTimers();
    render(<TimelineHarness />);

    expect(
      screen.queryByRole("slider", { name: "Selected forecast week" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Play weekly forecast" }),
    );
    await act(async () => vi.advanceTimersByTime(1_200));
    expect(screen.getByRole("tab", { name: /Week 24/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await act(async () => vi.advanceTimersByTime(1_200));
    expect(screen.getByRole("tab", { name: /Week 25/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await act(async () => vi.advanceTimersByTime(1_200));
    expect(
      screen.getByRole("button", { name: "Play weekly forecast" }),
    ).toBeVisible();
    vi.useRealTimers();
  });
});
