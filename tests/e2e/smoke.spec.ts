import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  "/",
  "/watch",
  "/planner",
  "/explore",
  "/about",
  "/about/model",
  "/route-that-does-not-exist",
];

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

test("metadata failure does not block metadata-independent pages", async ({
  page,
}) => {
  await page.route(/\/data\/(meta|version)\.json(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 503, body: "temporarily unavailable" }),
  );

  await page.goto("/about", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  await page.goto("/", { waitUntil: "domcontentloaded" });
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
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Open main menu" });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole("button", { name: "Planner" }).click();
  } else {
    await page
      .getByRole("link", { name: /Planner/i })
      .first()
      .click();
  }
  await expect(page).toHaveURL(/\/planner$/);
});

test("This Week renders the live map, forecast, places, details, and itinerary", async ({
  page,
}) => {
  const tileResponses: string[] = [];
  page.on("response", (response) => {
    if (/\.(?:png|pbf)(?:\?|$)/.test(response.url()) && response.ok())
      tileResponses.push(response.url());
  });
  await page.goto("/watch", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText(/recommended place/i).first()).toBeVisible({
    timeout: 45_000,
  });
  await expect
    .poll(() => tileResponses.length, { timeout: 45_000 })
    .toBeGreaterThan(0);

  const selectedForecastTab = page.getByRole("tab", { selected: true });
  await selectedForecastTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();

  const details = page.getByRole("button", { name: /details/i }).first();
  if (await details.isVisible()) {
    await details.click({ force: true });
    await expect(page.getByText("Why it is recommended")).toBeVisible();
    await page
      .getByRole("button", { name: "Add to itinerary" })
      .click({ force: true });
    await expect(page.getByText("Added to itinerary")).toBeVisible();
    await expect(page.locator(".plannerMapMarker.is-pulsing")).toBeVisible();

    const canvas = page.locator("canvas.maplibregl-canvas").first();
    const canvasBounds = await canvas.boundingBox();
    expect(canvasBounds).not.toBeNull();
    let emptyMapPoint: { x: number; y: number } | null = null;
    for (
      let y = (canvasBounds?.y ?? 0) + 80;
      y < (canvasBounds?.y ?? 0) + (canvasBounds?.height ?? 0) - 120 &&
      !emptyMapPoint;
      y += 40
    ) {
      for (
        let x = (canvasBounds?.x ?? 0) + 80;
        x < (canvasBounds?.x ?? 0) + (canvasBounds?.width ?? 0) - 120;
        x += 40
      ) {
        const isBareMapCanvas = await page.evaluate(
          ({ pointX, pointY }) =>
            document
              .elementFromPoint(pointX, pointY)
              ?.classList.contains("maplibregl-canvas") ?? false,
          { pointX: x, pointY: y },
        );
        if (isBareMapCanvas) {
          emptyMapPoint = { x, y };
          break;
        }
      }
    }
    expect(emptyMapPoint).not.toBeNull();
    await page.mouse.click(emptyMapPoint?.x ?? 0, emptyMapPoint?.y ?? 0);
    await expect(page.locator(".plannerMapMarker.is-pulsing")).toHaveCount(0);
  }
});

test("mobile navigation opens and closes", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile navigation project only",
  );
  await page.goto("/watch", { waitUntil: "domcontentloaded" });
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
  await page.goto("/planner", { waitUntil: "domcontentloaded" });

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
  await page.goto("/planner?resume=1", { waitUntil: "domcontentloaded" });
  await poiResponse;
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });

  await page.getByRole("button", { name: /Places/ }).click();
  await page.getByRole("button", { name: "All POIs" }).click();

  const locationPicker = page.getByRole("combobox", {
    name: "Browse map locations",
  });
  await expect(locationPicker).toBeAttached();
  await expect
    .poll(() => locationPicker.locator("option").count())
    .toBeGreaterThan(1);

  const map = page.locator('[data-tour="map-canvas"]');
  await expect
    .poll(async () => Number(await map.getAttribute("data-planner-poi-count")))
    .toBeGreaterThan(0);
  // Bulk POIs must stay in MapLibre's GPU layers. Hundreds of HTML markers
  // make every zoom frame perform hundreds of DOM layout updates.
  await expect
    .poll(() => page.locator(".plannerMapMarker").count())
    .toBeLessThan(100);

  const mapBounds = await map.boundingBox();
  expect(mapBounds).not.toBeNull();
  let hoveredPoi: { x: number; y: number; name: string } | null = null;
  for (
    let y = (mapBounds?.y ?? 0) + 80;
    y < (mapBounds?.y ?? 0) + (mapBounds?.height ?? 0) - 220 && !hoveredPoi;
    y += 28
  ) {
    for (
      let x = (mapBounds?.x ?? 0) + 480;
      x < (mapBounds?.x ?? 0) + (mapBounds?.width ?? 0) - 140;
      x += 28
    ) {
      await page.mouse.move(x, y);
      const label = page.locator(".plannerMapHoverLabel");
      if (await label.isVisible()) {
        hoveredPoi = { x, y, name: (await label.innerText()).trim() };
        break;
      }
    }
  }

  expect(hoveredPoi).not.toBeNull();
  expect(hoveredPoi?.name).toMatch(/\S/);
  const hoverPopup = page.locator(".plannerMapHoverPopup");
  await expect(hoverPopup).toBeVisible();
  await expect
    .poll(() =>
      hoverPopup.evaluate(
        (element) => element === element.parentElement?.lastElementChild,
      ),
    )
    .toBe(true);
  await page.mouse.click(hoveredPoi?.x ?? 0, hoveredPoi?.y ?? 0);
  await expect(page.getByText("About this location")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: hoveredPoi?.name }),
  ).toBeVisible();
  await expect
    .poll(() => map.getAttribute("data-planner-pulsing-location"))
    .not.toBe("");

  const settledMapBounds = await map.boundingBox();
  expect(settledMapBounds).not.toBeNull();
  let emptyMapPoint: { x: number; y: number } | null = null;
  for (
    let y = (settledMapBounds?.y ?? 0) + 80;
    y < (settledMapBounds?.y ?? 0) + (settledMapBounds?.height ?? 0) - 220 &&
    !emptyMapPoint;
    y += 40
  ) {
    for (
      let x = (settledMapBounds?.x ?? 0) + 80;
      x < (settledMapBounds?.x ?? 0) + (settledMapBounds?.width ?? 0) - 120;
      x += 40
    ) {
      await page.mouse.move(x, y);
      const isBareMapCanvas = await page.evaluate(
        ({ pointX, pointY }) =>
          document
            .elementFromPoint(pointX, pointY)
            ?.classList.contains("maplibregl-canvas") ?? false,
        { pointX: x, pointY: y },
      );
      if (
        isBareMapCanvas &&
        !(await page.locator(".plannerMapHoverLabel").isVisible())
      ) {
        emptyMapPoint = { x, y };
        break;
      }
    }
  }
  expect(emptyMapPoint).not.toBeNull();
  await page.mouse.click(emptyMapPoint?.x ?? 0, emptyMapPoint?.y ?? 0);
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

test("This Week exposes its mobile page heading", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.goto("/watch", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /This week.s orca forecast/i,
    }),
  ).toBeAttached();
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
