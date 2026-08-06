import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getNavigationRoutes, routePath } from "../config/routes";
import { NotFoundPage } from "../../pages/NotFoundPage/NotFoundPage";
import { MenuProvider } from "../state/MenuContext";
import { AppHeader } from "./AppHeader";
import { ForecastLabHeader } from "./ForecastLabHeader";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { SideDrawer } from "./SideDrawer";

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open menu
      </button>
      <SideDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe("application navigation", () => {
  it.each(["home", "about", "model"] as const)(
    "uses the canonical primary links on the %s header",
    (routeId) => {
      render(
        <MemoryRouter initialEntries={[routePath(routeId)]}>
          <PrimaryNavigation ariaLabel="Page navigation" />
        </MemoryRouter>,
      );

      expect(
        screen.getAllByRole("link").map((link) => link.textContent),
      ).toEqual(["This Week", "Plan a Trip", "Explore"]);
    },
  );

  it.each(
    getNavigationRoutes("primary").map((route) => [
      route.path,
      route.navigationLabel,
    ]),
  )("marks %s as the active forecast route", (path, activeLabel) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ForecastLabHeader onOpenMenu={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: activeLabel })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen
        .getByRole("navigation", { name: "Forecast navigation" })
        .querySelectorAll('[aria-current="page"]'),
    ).toHaveLength(1);
  });

  it("exposes labelled header actions", async () => {
    const user = userEvent.setup();
    const onMenu = vi.fn();
    render(
      <MemoryRouter initialEntries={[routePath("watch")]}>
        <AppHeader
          title="OrcaCast"
          subtitle="This Week"
          onOpenMenu={onMenu}
          rightSlot={
            <nav aria-label="Header navigation">
              <Link to={routePath("planner")} aria-label="Plan a trip">
                Plan a trip
              </Link>
              <Link to={routePath("explore")} aria-label="Explore">
                Explore
              </Link>
            </nav>
          }
        />
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Open main menu" }));
    expect(onMenu).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("link", { name: "About OrcaCast" }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      routePath("about"),
    );
    expect(
      screen.getByRole("link", { name: "About OrcaCast" }),
    ).toHaveAttribute("aria-current", "page");

    expect(screen.getByRole("link", { name: "Plan a trip" })).toHaveAttribute(
      "aria-label",
      "Plan a trip",
    );
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "aria-label",
      "Explore",
    );

    await user.click(screen.getByRole("link", { name: "OrcaCast home" }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      routePath("home"),
    );
    expect(screen.getByRole("link", { name: "OrcaCast home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("navigates from the drawer and closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={[routePath("home")]}>
        <SideDrawer open onClose={onClose} />
        <CurrentPath />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Plan a Trip" }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      routePath("planner"),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("derives the 404 destinations from the route registry", () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <MenuProvider>
          <NotFoundPage />
        </MenuProvider>
      </MemoryRouter>,
    );

    const popularRoutes = screen
      .getByRole("navigation", { name: "Popular destinations" })
      .querySelectorAll("a");
    expect(Array.from(popularRoutes, (link) => link.textContent)).toEqual(
      getNavigationRoutes("notFound").map((route) => route.navigationLabel),
    );
  });

  it("traps focus, closes on Escape, and restores the opener", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[routePath("home")]}>
        <DrawerHarness />
      </MemoryRouter>,
    );

    const opener = screen.getByRole("button", { name: "Open menu" });
    await user.click(opener);

    const closeButton = screen.getByRole("button", { name: "Close menu" });
    expect(closeButton).toHaveFocus();
    expect(opener).toHaveProperty("inert", true);

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "About" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Main menu" })).toBeNull();
    expect(opener).toHaveFocus();
    expect(opener).not.toHaveProperty("inert", true);
  });
});
