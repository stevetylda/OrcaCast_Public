import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  APP_ROUTES,
  NAVIGABLE_ROUTE_LIST,
  getNavigationRoutes,
  routePath,
} from "../../src/shared/config/routes";

const routes = [
  ...NAVIGABLE_ROUTE_LIST.map((route) => route.path),
  "/route-that-does-not-exist",
];
const plannerResumePath = `${routePath("planner")}?resume=1`;

function pathSuffixPattern(path: string) {
  return new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("orcacast.welcome.seen", "true");
  });
});

function monitorPage(page: Page, baseURL: string) {
  const consoleErrors: string[] = [];
  const firstPartyFailures: string[] = [];
  const base = new URL(baseURL);

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === base.origin && response.status() >= 400) {
      firstPartyFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const reason = request.failure()?.errorText ?? "failed";
    if (url.origin === base.origin && !reason.includes("ERR_ABORTED")) {
      firstPartyFailures.push(`${reason} ${url.pathname}`);
    }
  });
  return { consoleErrors, firstPartyFailures };
}

async function openMobileFieldPicks(page: Page) {
  if ((page.viewportSize()?.width ?? 9999) > 760) return;
  const trigger = page.getByRole("button", {
    name: "Expand recommended places",
  });
  await expect(trigger).toBeVisible();
  await trigger.click();
}

async function openForecastWeekSelector(page: Page) {
  if ((await page.getByRole("tab").count()) > 0) return;
  await page
    .getByRole("button", { name: /^Open forecast window and week selector/ })
    .click();
  await expect(page.getByRole("tab").first()).toBeVisible();
}

test("metadata failure does not block metadata-independent pages", async ({
  page,
}) => {
  await page.route(/\/data\/(meta|version)\.json(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 503, body: "temporarily unavailable" }),
  );

  await page.goto(routePath("about"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  await page.goto(routePath("home"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

for (const route of routes) {
  test(`${route} loads directly, refreshes, and has no serious accessibility violations`, async ({
    page,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const monitor = monitorPage(page, baseURL);
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("h1").first()).toContainText(/\S/);

    const refresh = await page.reload({ waitUntil: "domcontentloaded" });
    expect(refresh?.status()).toBeLessThan(400);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = accessibility.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    );
    const summary = blocking.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
    expect(blocking, JSON.stringify(summary, null, 2)).toEqual([]);
    const unhandledConsoleErrors = monitor.consoleErrors.filter(
      (message) =>
        !(
          message.startsWith("[MapLibre] error:") &&
          message.includes("Failed to fetch")
        ),
    );
    expect(unhandledConsoleErrors, unhandledConsoleErrors.join("\n")).toEqual(
      [],
    );
    expect(
      monitor.firstPartyFailures,
      monitor.firstPartyFailures.join("\n"),
    ).toEqual([]);
  });
}

test("primary navigation works", async ({ page }) => {
  await page.goto(routePath("home"), { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Open main menu" });
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .getByRole("button", {
        name: APP_ROUTES.planner.navigationLabel,
      })
      .click();
  } else {
    await page
      .getByRole("link", {
        name: APP_ROUTES.planner.navigationLabel,
      })
      .first()
      .click();
  }
  await expect(page).toHaveURL(
    new RegExp(`${routePath("planner").replace("/", "\\/")}$`),
  );
});

test("forecast header underlines the active route in orange", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.startsWith("mobile"),
    "Desktop forecast navigation only",
  );
  for (const route of getNavigationRoutes("primary")) {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    const activeLink = page.getByRole("link", {
      name: route.navigationLabel,
      exact: true,
    });
    await expect(activeLink).toHaveAttribute("aria-current", "page");
    const decoration = await activeLink.evaluate((link) => {
      const style = getComputedStyle(link);
      return {
        color: style.textDecorationColor,
        line: style.textDecorationLine,
      };
    });
    expect(decoration.line).toContain("underline");
    expect(decoration.color).toBe("rgb(255, 100, 88)");
  }
});

test("This Week renders the live map, forecast, places, details, and itinerary", async ({
  page,
}) => {
  const forecastRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/weekly\/(?:srkw|transient)\/[^/]+\/\d{4}_\d+_H6\.json/.test(
        request.url(),
      )
    ) {
      forecastRequests.push(request.url());
    }
  });
  await page.goto(routePath("watch"), { waitUntil: "domcontentloaded" });
  await openMobileFieldPicks(page);
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("article").first()).toBeVisible({
    timeout: 45_000,
  });
  const requestCounts = new Map<string, number>();
  forecastRequests.forEach((url) =>
    requestCounts.set(url, (requestCounts.get(url) ?? 0) + 1),
  );
  expect(requestCounts.size).toBeGreaterThan(0);
  expect(Math.max(...requestCounts.values())).toBe(1);

  await openForecastWeekSelector(page);
  const selectedForecastTab = page.getByRole("tab", { selected: true });
  await selectedForecastTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();

  const details = page.getByRole("button", { name: /view details/i }).first();
  if (await details.isVisible()) {
    await details.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByText("Why it is recommended")).toBeVisible();
    await page
      .getByRole("button", { name: "Add to itinerary" })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByText("Added to itinerary")).toBeVisible();
    await expect(page.locator(".plannerMapMarker.is-pulsing")).toBeVisible();

    await page
      .getByRole("button", { name: "Back to field picks" })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator(".plannerMapMarker.is-pulsing")).toHaveCount(0);
  }
});

test("This Week playback advances forward with field picks unloaded", async ({
  page,
}, testInfo) => {
  await page.goto(routePath("watch"), { waitUntil: "domcontentloaded" });
  await openMobileFieldPicks(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("article").first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(
    page.getByRole("slider", { name: "Selected forecast week" }),
  ).toHaveCount(0);

  if (!testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("combobox", { name: "Surface view" })
      .selectOption("surface");
    await expect(
      page.getByRole("combobox", { name: "Surface view" }),
    ).toHaveValue("surface");
    await page.getByRole("button", { name: "Close settings" }).click();
  }

  await openForecastWeekSelector(page);
  const firstWeek = page.getByRole("tab").first();
  await firstWeek.click();
  const startingIndex = Number(
    await page
      .getByRole("tab", { selected: true })
      .getAttribute("data-forecast-period-index"),
  );
  await page.getByRole("button", { name: "Play weekly forecast" }).click();
  await expect(
    page.getByRole("status", { name: "Playing weekly forecast" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("tab", { selected: true })
          .getAttribute("data-forecast-period-index"),
      ),
    )
    .toBeGreaterThan(startingIndex);

  await page.getByRole("button", { name: "Pause playback" }).click();
  await expect(
    page.getByRole("status", { name: "Playing weekly forecast" }),
  ).toHaveCount(0);
  await expect(page.getByRole("article").first()).toBeVisible({
    timeout: 45_000,
  });
});

test("This Week Watch and Listen open media details without map popups", async ({
  page,
}) => {
  await page.goto(routePath("watch"), { waitUntil: "domcontentloaded" });
  const map = page.locator('[data-tour="map-canvas"]');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await expect
    .poll(async () =>
      Number(await map.getAttribute("data-planner-camera-count")),
    )
    .toBe(0);

  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Watch locations 48" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await map.getAttribute("data-planner-camera-count")),
    )
    .toBe(48);

  const webcamList = page.locator(".suggestedPlacesPanel__content");
  const listMetrics = await webcamList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(["auto", "scroll"]).toContain(listMetrics.overflowY);
  expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);
  await page
    .locator(".suggestedPlacesPanel__mediaCard")
    .first()
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("Webcam details", { exact: true })).toBeVisible();
  const goWatch = page.getByRole("button", { name: "Go Watch" }).first();
  await expect(goWatch).toBeVisible();
  await expect(goWatch).toHaveAttribute("title", /^https?:\/\//);
  await goWatch.click();
  await expect(
    page.getByText(
      "This button will take you to a website that is not OrcaCast.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nah" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Yah" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await page.getByRole("button", { name: "Nah" }).click();

  await page.getByRole("button", { name: "Back to watch locations" }).click();
  await page
    .getByRole("button", { name: "Back to recommended places" })
    .click();
  await expect
    .poll(async () =>
      Number(await map.getAttribute("data-planner-camera-count")),
    )
    .toBe(0);

  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Listen locations 5" }),
  ).toBeVisible();
  await page
    .locator(".suggestedPlacesPanel__mediaCard")
    .first()
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.getByText("Hydrophone details", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Go Listen" })).toHaveAttribute(
    "title",
    "https://live.orcasound.net/",
  );
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});

test("mobile navigation opens and closes", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile navigation project only",
  );
  await page.goto(routePath("watch"), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open main menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeHidden();
});

test("mobile Planner keeps the complete form within reach", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile Planner regression test",
  );
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto(routePath("planner"), { waitUntil: "domcontentloaded" });

  const promptCard = page.locator(".plannerResultsPage__promptCard");
  await expect(promptCard).toBeVisible();

  const layout = await promptCard.evaluate((card) => {
    const cardRect = card.getBoundingClientRect();
    const submitRect = card
      .querySelector(".plannerResultsPage__promptSubmit")
      ?.getBoundingClientRect();
    return {
      cardBottom: cardRect.bottom,
      cardTop: cardRect.top,
      overflowY: getComputedStyle(card).overflowY,
      position: getComputedStyle(card).position,
      submitBottom: submitRect?.bottom ?? Number.POSITIVE_INFINITY,
      submitTop: submitRect?.top ?? Number.NEGATIVE_INFINITY,
      viewportHeight: window.innerHeight,
    };
  });

  expect(layout.position).toBe("absolute");
  expect(layout.overflowY).toBe("auto");
  expect(layout.cardTop).toBeGreaterThanOrEqual(0);
  expect(layout.cardBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.submitTop).toBeGreaterThanOrEqual(layout.cardTop);
  expect(layout.submitBottom).toBeLessThanOrEqual(layout.viewportHeight);
});

test("Planner renders each POI filter without bulk DOM markers", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "orcacast.planner.selection",
      JSON.stringify({
        city: "Friday Harbor, WA",
        arrivalDate: "2026-07-14",
        departureDate: "2026-07-16",
      }),
    );
  });

  const poiResponse = page.waitForResponse((response) =>
    response.url().includes("/data/places_of_interest.json"),
  );
  await page.goto(plannerResumePath, { waitUntil: "domcontentloaded" });
  await poiResponse;
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });

  await page.getByRole("button", { name: /Places/ }).click();
  const map = page.locator('[data-tour="map-canvas"]');
  await page.getByRole("button", { name: "All POIs" }).click();

  const locationPicker = page.getByRole("combobox", {
    name: "Browse map locations",
  });
  await expect(locationPicker).toBeAttached();
  await expect
    .poll(() => locationPicker.locator("option").count())
    .toBeGreaterThan(1);

  await expect
    .poll(async () => Number(await map.getAttribute("data-planner-poi-count")))
    .toBeGreaterThan(0);
  // Bulk POIs must stay in MapLibre's GPU layers. Hundreds of HTML markers
  // make every zoom frame perform hundreds of DOM layout updates.
  await expect
    .poll(() => page.locator(".plannerMapMarker").count())
    .toBeLessThan(100);

  const firstPoiOption = locationPicker.locator("option").nth(1);
  const firstPoiName =
    (await firstPoiOption.textContent())?.split(" — ")[0]?.trim() ?? "";
  const firstPoiValue = await firstPoiOption.getAttribute("value");
  expect(firstPoiName).toMatch(/\S/);
  expect(firstPoiValue).toBeTruthy();
  await locationPicker.selectOption(firstPoiValue ?? "");
  await expect(page.getByText("About this location")).toBeVisible();
  await expect(page.getByRole("heading", { name: firstPoiName })).toBeVisible();
  await expect
    .poll(() => map.getAttribute("data-planner-pulsing-location"))
    .not.toBe("");
  await page.getByRole("button", { name: "Top Places" }).click();
  await expect
    .poll(() => map.getAttribute("data-planner-pulsing-location"))
    .toBe("");

  for (const filter of ["Parks", "Marinas", "Ferries"]) {
    await page.getByRole("button", { name: "Top Places" }).click();
    await page.getByRole("button", { name: filter }).click();
    await expect
      .poll(async () =>
        Number(await map.getAttribute("data-planner-poi-count")),
      )
      .toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: filter })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "All POIs" }),
    ).toHaveAttribute("aria-pressed", "false");
  }
});

test("Planner loads date-weighted historical smooth weeks by default", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "orcacast.planner.selection",
      JSON.stringify({
        city: "Friday Harbor, WA",
        arrivalDate: "2026-06-29",
        departureDate: "2026-07-08",
      }),
    );
  });

  const requestedTiffs: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/week_of_year_agg_history_smooth/")) {
      requestedTiffs.push(url);
      expect(response.ok()).toBeTruthy();
    }
  });

  await page.goto(plannerResumePath, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  if (!testInfo.project.name.startsWith("mobile")) {
    await page
      .getByRole("button", { name: "Expand recommended viewing spots" })
      .click();
    const sidebarPosition = await page
      .locator(".plannerResultsPage__tripSidebar")
      .evaluate((sidebar) => {
        const rect = sidebar.getBoundingClientRect();
        return {
          left: rect.left,
          rightGap: window.innerWidth - rect.right,
          viewportWidth: window.innerWidth,
        };
      });
    expect(sidebarPosition.left).toBeGreaterThan(
      sidebarPosition.viewportWidth / 2,
    );
    expect(sidebarPosition.rightGap).toBe(24);

    const belowTripCardHitTarget = await page.evaluate(() => {
      const stack = document.querySelector<HTMLElement>(
        ".plannerResultsPage__leftTripStack",
      );
      const card = stack?.querySelector<HTMLElement>(
        ".plannerResultsPage__sidebarTripCard",
      );
      if (!stack || !card) return null;
      const stackRect = stack.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const target = document.elementFromPoint(
        stackRect.left + stackRect.width / 2,
        Math.min(stackRect.bottom - 20, cardRect.bottom + 44),
      );
      return {
        className: target?.className ?? "",
        insideTripStack: Boolean(
          target?.closest(".plannerResultsPage__leftTripStack"),
        ),
      };
    });
    expect(belowTripCardHitTarget).not.toBeNull();
    expect(belowTripCardHitTarget?.insideTripStack).toBe(false);
    expect(String(belowTripCardHitTarget?.className)).toContain(
      "maplibregl-canvas",
    );
  }
  expect(requestedTiffs).toHaveLength(0);
  await page.getByRole("button", { name: "Open planner settings" }).click();
  const surfaceView = page.getByRole("combobox", { name: "Surface view" });
  await expect(surfaceView).toHaveValue("grid");
  await surfaceView.selectOption("surface");
  await expect(surfaceView).toHaveValue("surface");

  await expect
    .poll(
      () =>
        requestedTiffs.some((url) =>
          new URL(url).pathname.endsWith("week_27.tif"),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        requestedTiffs.some((url) =>
          new URL(url).pathname.endsWith("week_28.tif"),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(requestedTiffs).toHaveLength(2);
  expect(requestedTiffs.every((url) => url.includes("/srkw/"))).toBe(true);

  if (!testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Close settings" }).click();
    await page
      .getByRole("button", { name: "Activity likelihood color scale" })
      .click();
    await page.getByRole("option", { name: "Rose Noir" }).click();
    await page
      .getByRole("button", { name: "Activity likelihood color scale" })
      .click();
    await expect(
      page.getByRole("option", { name: "Rose Noir" }),
    ).toHaveAttribute("aria-selected", "true");
  }
});

test("Planner sidebar stays right after a This Week round trip", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.startsWith("mobile"),
    "Desktop Planner sidebar regression",
  );
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "orcacast.planner.selection",
      JSON.stringify({
        city: "Sequim, WA",
        arrivalDate: "2026-08-03",
        departureDate: "2026-08-21",
      }),
    );
  });

  const readSidebarPosition = () =>
    page.locator(".plannerResultsPage__tripSidebar").evaluate((sidebar) => {
      const rect = sidebar.getBoundingClientRect();
      return {
        left: rect.left,
        position: getComputedStyle(sidebar).position,
        rightGap: window.innerWidth - rect.right,
        viewportWidth: window.innerWidth,
      };
    });
  const readLegendStyle = async () => {
    const legend = page.locator(".activityLegend:visible");
    await legend.waitFor({ state: "visible" });
    return legend.evaluate((legend) => {
      const rect = legend.getBoundingClientRect();
      const style = getComputedStyle(legend);
      return {
        background: style.backgroundColor,
        border: style.border,
        borderRadius: style.borderRadius,
        gap: style.gap,
        height: rect.height,
        padding: style.padding,
        width: rect.width,
      };
    });
  };

  await page.goto(plannerResumePath, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await page
    .getByRole("button", { name: "Expand recommended viewing spots" })
    .click();
  const initialSidebar = await readSidebarPosition();
  const plannerLegend = await readLegendStyle();

  await page.getByRole("link", { name: "This week" }).click();
  await expect(page).toHaveURL(pathSuffixPattern(routePath("watch")));
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  const watchLegend = await readLegendStyle();

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(pathSuffixPattern(plannerResumePath));
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await page
    .getByRole("button", { name: "Expand recommended viewing spots" })
    .click();
  const returnedSidebar = await readSidebarPosition();
  const returnedLegend = await readLegendStyle();

  for (const sidebar of [initialSidebar, returnedSidebar]) {
    expect(sidebar.position).toBe("absolute");
    expect(sidebar.left).toBeGreaterThan(sidebar.viewportWidth / 2);
    expect(sidebar.rightGap).toBe(24);
  }
  expect(watchLegend.width).toEqual(plannerLegend.width);
  expect(returnedLegend).toEqual(plannerLegend);
});

test("Planner toggles the grouped webcam inventory", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "orcacast.planner.selection",
      JSON.stringify({
        city: "Friday Harbor, WA",
        arrivalDate: "2026-07-14",
        departureDate: "2026-07-16",
      }),
    );
  });

  await page.goto(plannerResumePath, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  const map = page.locator('[data-tour="map-canvas"]');
  await page.getByRole("button", { name: /Places/ }).click();
  await page.getByRole("button", { name: "Cameras" }).click();
  await expect
    .poll(async () =>
      Number(await map.getAttribute("data-planner-camera-count")),
    )
    .toBe(48);

  await page.getByRole("button", { name: "Cameras" }).click();
  await expect
    .poll(async () =>
      Number(await map.getAttribute("data-planner-camera-count")),
    )
    .toBe(0);
});

test("This Week exposes its mobile page heading", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.goto(routePath("watch"), { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(This week|Latest available)\s*·/i,
    }),
  ).toBeAttached();
});

test("mobile Field Picks starts collapsed and expands from five to 25", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.goto(routePath("watch"), { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", {
    name: "Expand recommended places",
  });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await trigger.click();
  await expect(page.getByRole("article")).toHaveCount(5, { timeout: 45_000 });
  const panel = page.locator(".suggestedPlacesPanel");
  const panelHeight = await panel.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(panelHeight).toBeLessThanOrEqual(
    Math.ceil((page.viewportSize()?.height ?? 0) * 0.55) + 1,
  );
  await page.getByRole("button", { name: "Show all 25" }).click();
  await expect(page.getByRole("article")).toHaveCount(25);
});

test("favicons, manifest, fonts, style, and CORS-enabled map resources respond", async ({
  request,
  baseURL,
}) => {
  for (const pathname of [
    "/images/OrcaCast-Icon.png",
    "/site.webmanifest",
    "/data/manifest.json",
  ]) {
    const response = await request.get(new URL(pathname, baseURL).toString());
    expect(response.ok(), pathname).toBeTruthy();
  }
  const fontCss = await request.get(
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap",
  );
  expect(fontCss.ok()).toBeTruthy();
  const mapStyle = await request.get(
    "https://tiles.openfreemap.org/styles/bright",
  );
  expect(mapStyle.ok()).toBeTruthy();
  expect(mapStyle.headers()["access-control-allow-origin"]).toBeTruthy();
});
