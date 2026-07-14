import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RouteMetadata } from "./RouteMetadata";

describe("route metadata", () => {
  it("updates titles and descriptions during client-side navigation", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/watch"]}>
        <RouteMetadata />
        <Link to="/planner">Planner</Link>
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );

    expect(document.title).toBe("This Week's Orca Forecast | OrcaCast");
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      "content",
      expect.stringContaining("modeled orca activity"),
    );

    await user.click(screen.getByRole("link", { name: "Planner" }));
    expect(document.title).toBe("Plan an Orca-Watching Trip | OrcaCast");
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Plan an Orca-Watching Trip | OrcaCast",
    );
  });

  it("uses not-found metadata for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <RouteMetadata />
      </MemoryRouter>,
    );

    expect(document.title).toBe("Page Not Found | OrcaCast");
  });
});
