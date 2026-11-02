import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapStateProvider, useMapState } from "./MapStateContext";

function Preferences() {
  const { unitsMode, setUnitsMode } = useMapState();
  return <button onClick={() => setUnitsMode("metric")}>{unitsMode}</button>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["getItem", "setItem"] as const)(
  "keeps preferences usable when storage %s throws",
  (method) => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    storage[method].mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });
    vi.stubGlobal("localStorage", storage);
    render(
      <MapStateProvider>
        <Preferences />
      </MapStateProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "imperial" }));
    expect(screen.getByRole("button", { name: "metric" })).toBeInTheDocument();
  },
);
