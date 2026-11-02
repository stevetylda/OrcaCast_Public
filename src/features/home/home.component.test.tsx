import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSeasonality } from "./HomeSeasonality";
import { HomeForecast } from "./HomeForecast";
import { HomeWeather } from "./HomeWeather";
import {
  loadHomeSeasonality,
  loadHomeForecastPeriods,
  loadHomeWeather,
} from "./homeData";
import { buildPeriod } from "../../shared/config/forecastPeriod";
vi.mock("./homeData", () => ({
  loadHomeSeasonality: vi.fn(),
  loadHomeForecastPeriods: vi.fn(),
  loadHomeWeather: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
describe("home data states", () => {
  it("does not render empty records as a populated chart or permanent loading", async () => {
    vi.mocked(loadHomeSeasonality).mockResolvedValue({
      histogram: [],
      year_min: 1980,
      year_max: 2026,
      source: "SIGHTINGS_DATA",
    });
    render(<HomeSeasonality />);
    expect(
      await screen.findByText(
        "No seasonal reports are available in this record.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });
  it("allows retry after a failed seasonal request and exposes exact data", async () => {
    vi.mocked(loadHomeSeasonality)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        histogram: [{ day_of_year: 1, count: 12 }],
        year_min: 1980,
        year_max: 2026,
        source: "SIGHTINGS_DATA",
      });
    render(<HomeSeasonality />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Retry seasonal reports" }),
    );
    await userEvent.click(
      await screen.findByText("View seasonal report counts"),
    );
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("cell", { name: "12" })).toBeVisible();
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });
  it("labels an old published period without calling it this week's forecast", async () => {
    vi.mocked(loadHomeForecastPeriods).mockResolvedValue([
      buildPeriod(2020, 29),
    ]);
    render(
      <MemoryRouter>
        <HomeForecast />
      </MemoryRouter>,
    );
    expect(await screen.findByText("This week is unavailable")).toBeVisible();
    expect(screen.getByText(/2020-07-13/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open forecast map/ }),
    ).toHaveAttribute("href", "/watch");
  });
  it("keeps unknown availability distinct from an absent current period", async () => {
    vi.mocked(loadHomeForecastPeriods).mockRejectedValue(new Error("offline"));
    render(
      <MemoryRouter>
        <HomeForecast />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Availability unknown")).toBeVisible();
    expect(
      screen.queryByText("This week is unavailable"),
    ).not.toBeInTheDocument();
  });
  it("does not display plausible weather when the service fails", async () => {
    vi.mocked(loadHomeWeather).mockRejectedValue(new Error("offline"));
    render(<HomeWeather />);
    expect(
      await screen.findByRole("button", { name: "Retry weather" }),
    ).toBeVisible();
    expect(screen.queryByText("Mixed")).not.toBeInTheDocument();
  });
});
