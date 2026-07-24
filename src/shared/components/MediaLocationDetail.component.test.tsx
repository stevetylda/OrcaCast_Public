import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WebcamSite } from "../../features/locations/types";
import { MediaLocationDetail } from "./MediaLocationDetail";

const webcam: WebcamSite = {
  id: "test-camera",
  name: "Test Camera",
  region: "Salish Sea",
  locality: "Test Point",
  waterbody: "Test Strait",
  latitude: 48.5,
  longitude: -123.1,
  coordinateQuality: "Exact",
  priorityScore: 99,
  feeds: [
    {
      id: "test-feed",
      name: "Test View",
      operator: "Test Operator",
      accessUrl: "https://example.com/watch?camera=1",
      feedFormat: "Camera page",
      status: "landing-verified",
      verifiedAt: "2026-07-17",
      tier: 1,
      priorityScore: 99,
      caveat: "Availability may vary.",
    },
  ],
};

describe("MediaLocationDetail", () => {
  it("confirms before opening an external webcam page", async () => {
    render(
      <MediaLocationDetail
        webcam={webcam}
        onBack={vi.fn()}
        onCenterMap={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Go Watch" });
    expect(button).toHaveAttribute(
      "title",
      "https://example.com/watch?camera=1",
    );
    await userEvent.click(button);
    expect(
      screen.getByText(
        "This button will take you to a website that is not OrcaCast.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yah" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    await userEvent.click(screen.getByRole("button", { name: "Nah" }));
    expect(screen.queryByRole("link", { name: "Yah" })).not.toBeInTheDocument();
  });
});
