import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
import { SideDrawer } from "./SideDrawer";

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

describe("application navigation", () => {
  it("exposes labelled header actions", async () => {
    const user = userEvent.setup();
    const onMenu = vi.fn();
    const onInfo = vi.fn();
    render(
      <AppHeader
        title="OrcaCast"
        subtitle="This Week"
        onOpenMenu={onMenu}
        onOpenInfo={onInfo}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Info" }));
    expect(onMenu).toHaveBeenCalledOnce();
    expect(onInfo).toHaveBeenCalledOnce();
  });

  it("navigates from the drawer and closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SideDrawer open onClose={onClose} />
        <CurrentPath />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Planner" }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/planner");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
