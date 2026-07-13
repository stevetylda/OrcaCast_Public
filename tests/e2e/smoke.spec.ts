import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const routes = ["/", "/watch", "/planner", "/about", "/about/model"];

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
    const contrastBacklog = accessibility.violations.filter(
      (item) => item.id === "color-contrast",
    );
    if (contrastBacklog.length) {
      test.info().annotations.push({
        type: "accessibility-warning",
        description: `${contrastBacklog.flatMap((item) => item.nodes).length} known contrast findings`,
      });
    }
    const blocking = accessibility.violations.filter(
      (item) =>
        item.id !== "color-contrast" &&
        (item.impact === "critical" || item.impact === "serious"),
    );
    const summary = blocking.map((item) => ({
      id: item.id,
      impact: item.impact,
      targets: item.nodes.flatMap((node) => node.target),
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
  const menu = page.getByRole("button", { name: "Menu" });
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

  const details = page.getByRole("button", { name: /details/i }).first();
  if (await details.isVisible()) {
    await details.click({ force: true });
    await expect(page.getByText("Why it is recommended")).toBeVisible();
    await page
      .getByRole("button", { name: "Add to itinerary" })
      .click({ force: true });
    await expect(page.getByText("Added to itinerary")).toBeVisible();
  }
});

test("mobile navigation opens and closes", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile navigation project only",
  );
  await page.goto("/watch", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeHidden();
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
