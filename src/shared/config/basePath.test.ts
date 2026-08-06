import { describe, expect, it } from "vitest";
import { joinBasePath } from "./basePath";

describe("joinBasePath", () => {
  it.each([
    ["/", "data/grid.json", "/data/grid.json"],
    ["/", "/data/grid.json", "/data/grid.json"],
    ["/orcacast/", "data/grid.json", "/orcacast/data/grid.json"],
    ["/orcacast", "/data/grid.json?v=2", "/orcacast/data/grid.json?v=2"],
    ["/orcacast/", "/orcacast/data/grid.json", "/orcacast/data/grid.json"],
    ["", "data/grid.json", "/data/grid.json"],
  ])("joins %s and %s", (base, path, expected) => {
    expect(joinBasePath(base, path)).toBe(expected);
  });

  it.each([
    "https://example.com/data.json",
    "http://example.com/data.json",
    "//cdn.example.com/data.json",
    "data:application/json,{}",
    "blob:https://example.com/id",
  ])("leaves absolute or special URLs unchanged", (url) => {
    expect(joinBasePath("/orcacast/", url)).toBe(url);
  });
});
