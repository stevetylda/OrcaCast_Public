import { describe, expect, it } from "vitest";
import {
  APP_ROUTE_LIST,
  APP_ROUTES,
  findRouteByPath,
  getNavigationRoutes,
  isRouteActive,
  routePath,
} from "./routes";

describe("route registry", () => {
  it("defines unique paths and complete metadata", () => {
    const paths = APP_ROUTE_LIST.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    APP_ROUTE_LIST.forEach((route) => {
      expect(route.pageName).not.toBe("");
      expect(route.navigationLabel).not.toBe("");
      expect(route.metadata.title).not.toBe("");
      expect(route.metadata.description).not.toBe("");
    });
  });

  it("normalizes trailing slashes and falls back to not found", () => {
    expect(findRouteByPath("/planner/").id).toBe("planner");
    expect(findRouteByPath("/missing").id).toBe("notFound");
    expect(routePath("watch")).toBe("/watch");
  });

  it("derives ordered navigation placements", () => {
    expect(getNavigationRoutes("primary").map((route) => route.id)).toEqual([
      "watch",
      "planner",
      "explore",
    ]);
    expect(getNavigationRoutes("drawer").map((route) => route.id)).toEqual([
      "home",
      "watch",
      "planner",
      "explore",
      "about",
    ]);
    expect(getNavigationRoutes("notFound").map((route) => route.id)).toEqual([
      "watch",
      "planner",
      "explore",
      "about",
      "model",
    ]);
  });

  it("uses prefix matching only for nested route groups", () => {
    expect(isRouteActive("/about/model", APP_ROUTES.about)).toBe(true);
    expect(isRouteActive("/planner/details", APP_ROUTES.planner)).toBe(false);
  });
});
