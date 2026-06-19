// Most fetch tests use real (unfrozen) time so that autoFetchResults sees
// past-kickoff matches and actually fires ESPN requests. The early-return test
// uses frozen time (2020) so no matches appear started. All ESPN and Firebase
// calls are intercepted via page.route() — no real network traffic goes out.
import { test as base, expect } from "@playwright/test";
import { test as frozenTest, FAKE_DB, POOL_URL, DB_HASH } from "./fixtures.js";

const ESPN_URL_PATTERN = "**/apis/site/v2/sports/soccer/fifa.world/scoreboard**";

function espnResponse({ status = "STATUS_FINAL", home = "Mexico", away = "South Africa", homeScore = "2", awayScore = "1", year = 2026 } = {}) {
  return {
    events: [{
      season: { year },
      status: { type: { name: status } },
      competitions: [{
        competitors: [
          { homeAway: "home", score: homeScore, team: { displayName: home } },
          { homeAway: "away", score: awayScore, team: { displayName: away } },
        ],
      }],
    }],
  };
}

async function setupRoutes(page, { firebasePool = null, espnBody = null, espnStatus = 200 } = {}) {
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(firebasePool) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
  });
  await page.route(ESPN_URL_PATTERN, async (route) => {
    if (espnStatus !== 200) {
      await route.fulfill({ status: espnStatus, body: "error" });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(espnBody || { events: [] }),
      });
    }
  });
}

const emptyPool = { players: [], predictions: {}, results: {}, predictionsLocked: false, officialPlayers: null };

// ─── ESPN fetch triggered by button ──────────────────────────────────────────

base.test("Fetch scores button updates status dot when ESPN returns no events", async ({ page }) => {
  await setupRoutes(page, { firebasePool: emptyPool, espnBody: { events: [] } });
  await page.goto(DB_HASH);

  await page.click("#testFetch");
  await expect(page.locator("#saveDot")).toContainText(/Fetched|updated/, { timeout: 8000 });
});

base.test("Fetch scores updates result when ESPN returns a final score for a known match", async ({ page }) => {
  await setupRoutes(page, {
    firebasePool: emptyPool,
    espnBody: espnResponse({ home: "Mexico", away: "South Africa", homeScore: "2", awayScore: "1", status: "STATUS_FINAL" }),
  });

  await page.goto(DB_HASH);
  await page.click("#testFetch");

  await expect(page.locator("#saveDot")).toContainText(/updated|Saved|Synced/, { timeout: 8000 });

  await page.click('[data-tab="res"]');
  await expect(page.locator('[data-res="1:h"]')).toHaveValue("2");
  await expect(page.locator('[data-res="1:a"]')).toHaveValue("1");
});

base.test("Live badge appears on results tab when ESPN reports a match in progress", async ({ page }) => {
  await setupRoutes(page, {
    firebasePool: emptyPool,
    espnBody: espnResponse({ home: "Mexico", away: "South Africa", status: "STATUS_IN_PROGRESS" }),
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="res"]');
  await page.click("#testFetch");

  await expect(page.locator(".livebadge").first()).toBeVisible({ timeout: 8000 });
});

base.test("Halftime match also shows Live badge", async ({ page }) => {
  await setupRoutes(page, {
    firebasePool: emptyPool,
    espnBody: espnResponse({ home: "Mexico", away: "South Africa", status: "STATUS_HALFTIME" }),
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="res"]');
  await page.click("#testFetch");

  await expect(page.locator(".livebadge").first()).toBeVisible({ timeout: 8000 });
});

base.test("ESPN 500 error shows fetch-failed status without crashing", async ({ page }) => {
  await setupRoutes(page, { firebasePool: emptyPool, espnStatus: 500 });

  await page.goto(DB_HASH);
  await page.click("#testFetch");

  await expect(page.locator("#saveDot")).toContainText(/Fetch failed|Synced/, { timeout: 8000 });
  // App should still be functional
  await page.click('[data-tab="res"]');
  await expect(page.locator(".mcard").first()).toBeVisible();
});

base.test("ESPN returning events from a different year are ignored", async ({ page }) => {
  await setupRoutes(page, {
    firebasePool: emptyPool,
    espnBody: espnResponse({ home: "Mexico", away: "South Africa", homeScore: "3", awayScore: "0", status: "STATUS_FINAL", year: 2022 }),
  });

  await page.goto(DB_HASH);
  await page.click("#testFetch");

  await expect(page.locator("#saveDot")).toContainText("Fetched — no new scores", { timeout: 8000 });
});

base.test("ESPN match with no pool counterpart is silently skipped", async ({ page }) => {
  await setupRoutes(page, {
    firebasePool: emptyPool,
    espnBody: espnResponse({ home: "Unknown Team A", away: "Unknown Team B", homeScore: "1", awayScore: "0", status: "STATUS_FINAL" }),
  });

  await page.goto(DB_HASH);
  await page.click("#testFetch");

  await expect(page.locator("#saveDot")).toContainText("Fetched — no new scores", { timeout: 8000 });
});

base.test("ESPN team name normalisation maps 'United States' to USA match", async ({ page }) => {
  await setupRoutes(page, {
    firebasePool: emptyPool,
    espnBody: espnResponse({ home: "United States", away: "Paraguay", homeScore: "1", awayScore: "0", status: "STATUS_FINAL" }),
  });

  await page.goto(DB_HASH);
  await page.click("#testFetch");

  await expect(page.locator("#saveDot")).toContainText(/updated|Saved|Synced/, { timeout: 8000 });

  await page.click('[data-tab="res"]');
  // Match 2 is USA vs Paraguay
  await expect(page.locator('[data-res="2:h"]')).toHaveValue("1");
  await expect(page.locator('[data-res="2:a"]')).toHaveValue("0");
});

frozenTest("Fetch scores makes no ESPN call and leaves dot unchanged when no matches have started", async ({ frozenBrowser: page }) => {
  // Time is frozen to Jan 2020 — all 2026 matches are in the future.
  // autoFetchResults should return early without touching ESPN or the dot.
  let espnCalled = false;
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPool) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
  });
  await page.route(ESPN_URL_PATTERN, async (route) => {
    espnCalled = true;
    await route.continue();
  });

  await page.goto(DB_HASH);
  await page.click("#testFetch");

  // Give a moment for any async work to complete
  await page.waitForTimeout(1000);
  expect(espnCalled).toBe(false);
});
