import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
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
  it("exposes labelled header actions", async () => {
    const user = userEvent.setup();
    const onMenu = vi.fn();
    const onInfo = vi.fn();
    render(
      <MemoryRouter initialEntries={["/watch"]}>
        <AppHeader
          title="OrcaCast"
          subtitle="This Week"
          onOpenMenu={onMenu}
          onOpenInfo={onInfo}
        />
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Info" }));
    expect(onMenu).toHaveBeenCalledOnce();
    expect(onInfo).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("link", { name: "OrcaCast home" }));
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/");
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

  it("traps focus, closes on Escape, and restores the opener", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
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
