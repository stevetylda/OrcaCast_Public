import { afterEach, expect, it, vi } from "vitest";
import { sessionPreferences } from "./browserStorage";
import {
  readStoredPlannerOpen,
  writeStoredPlannerOpen,
  clearStoredPlannerState,
} from "../../features/planner/model/plannerStorage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("allows planner reads, writes and reset when the storage getter is denied", () => {
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw new DOMException("Denied", "SecurityError");
  });
  expect(readStoredPlannerOpen(true)).toBe(true);
  expect(() => writeStoredPlannerOpen(true)).not.toThrow();
  expect(() => clearStoredPlannerState()).not.toThrow();
});

it("still persists values when storage is available", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  writeStoredPlannerOpen(true);
  expect(readStoredPlannerOpen(false)).toBe(true);
  clearStoredPlannerState();
  expect(readStoredPlannerOpen(false)).toBe(false);
  expect(sessionPreferences.getItem("missing")).toBeNull();
});
