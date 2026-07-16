import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlannerLocationField } from "./PlannerFields";

describe("PlannerLocationField", () => {
  it("supports selecting a base location from its accessible listbox", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <span id="location-label">Starting location</span>
        <PlannerLocationField
          value="Friday Harbor, WA"
          options={[
            {
              name: "Friday Harbor, WA",
              latitude: 48.534266,
              longitude: -123.017124,
            },
            {
              name: "Seattle, WA",
              latitude: 47.606209,
              longitude: -122.332069,
            },
          ]}
          labelledBy="location-label"
          valueId="location-value"
          onChange={onChange}
        />
      </div>,
    );

    const trigger = screen.getByRole("button", {
      name: /Starting location Friday Harbor/,
    });
    expect(trigger).not.toHaveAttribute("aria-controls");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-controls");
    expect(
      screen.getByRole("listbox", { name: "Base location options" }),
    ).toBeVisible();
    await user.click(screen.getByRole("option", { name: "Seattle, WA" }));
    expect(onChange).toHaveBeenCalledWith("Seattle, WA");
  });
});
