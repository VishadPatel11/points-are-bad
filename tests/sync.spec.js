import { test, expect, FAKE_DB, POOL_URL, DB_HASH } from "./fixtures.js";

// Helpers to build mock route handlers
function mockFirebase(page, { getResponse = null, putStatus = 200 } = {}) {
  return page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(getResponse),
      });
    } else if (route.request().method() === "PUT") {
      await route.fulfill({
        status: putStatus,
        contentType: "application/json",
        body: "true",
      });
    } else {
      await route.continue();
    }
  });
}

const emptyPool = {
  players: [],
  predictions: {},
  results: {},
  predictionsLocked: false,
  officialPlayers: null,
};

const poolWithPlayers = {
  ...emptyPool,
  players: [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ],
  predictions: {
    p1: { 1: { h: 2, a: 1 }, 2: { h: 0, a: 0 } },
    p2: { 1: { h: 1, a: 1 }, 2: { h: 3, a: 2 } },
  },
};

// ─── Connection & initial load ────────────────────────────────────────────────

test("loads existing pool players from Firebase on connect", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, { getResponse: poolWithPlayers });
  await page.goto(DB_HASH);

  await page.click('[data-tab="pred"]');
  const chips = page.locator(".chip:not(.add)");
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText("Alice");
  await expect(chips.nth(1)).toContainText("Bob");
});

test("creates a new pool via connectPool when GET returns null", async ({ frozenBrowser: page }) => {
  // connectPool (the Connect button flow) fires a PUT when GET returns null.
  // This is distinct from pullRemote (hash-based load) which only GETs.
  let putBody = null;
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    } else if (route.request().method() === "PUT") {
      putBody = JSON.parse(route.request().postData());
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
  });

  // Navigate without the hash so the setup prompt is shown
  await page.goto("/");
  await page.fill("#dbInput", FAKE_DB);
  await page.click("#connectBtn");

  // Wait for the PUT that initialises the new pool
  await page.waitForResponse(
    (res) => res.url() === POOL_URL && res.request().method() === "PUT"
  );
  expect(putBody).not.toBeNull();
  expect(putBody).toHaveProperty("players");
});

test("shows Synced status after a successful pull", async ({ frozenBrowser: page }) => {
  // Use a pool with players so pullRemote doesn't hit the empty-players path
  await mockFirebase(page, { getResponse: poolWithPlayers });
  await page.goto(DB_HASH);

  await expect(page.locator("#saveDot")).toHaveText("Synced");
});

test("shows Offline status when Firebase is unreachable", async ({ frozenBrowser: page }) => {
  await page.route(POOL_URL, (route) => route.abort("failed"));
  await page.goto(DB_HASH);

  await expect(page.locator("#saveDot")).toHaveText("Offline");
});

test("share link in banner contains the Firebase URL", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, { getResponse: emptyPool });
  await page.goto(DB_HASH);

  const linkValue = await page.locator("#shareLink").inputValue();
  expect(linkValue).toContain(encodeURIComponent(FAKE_DB));
});

// ─── Save (queueSave) ─────────────────────────────────────────────────────────

test("adding a player triggers a PUT to Firebase", async ({ frozenBrowser: page }) => {
  let putCalled = false;
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    } else if (route.request().method() === "PUT") {
      putCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');
  await page.click("#addPlayer");

  // Wait for the debounced save (700ms) to fire
  await page.waitForResponse((res) => res.url() === POOL_URL && res.request().method() === "PUT");
  expect(putCalled).toBe(true);
});

test("PUT body contains the new player after they are added", async ({ frozenBrowser: page }) => {
  let savedState = null;
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    } else if (route.request().method() === "PUT") {
      savedState = JSON.parse(route.request().postData());
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');
  await page.click("#addPlayer");
  await page.fill("#renameInput", "Vish");

  await page.waitForResponse(
    (res) => res.url() === POOL_URL && res.request().method() === "PUT" &&
      JSON.parse(res.request().postData()).players.some((p) => p.name === "Vish")
  );

  expect(savedState.players.some((p) => p.name === "Vish")).toBe(true);
});

test("shows Saved then Synced after a successful PUT", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, { getResponse: emptyPool });
  await page.goto(DB_HASH);

  await page.click('[data-tab="pred"]');
  await page.click("#addPlayer");

  await expect(page.locator("#saveDot")).toHaveText("Saving…");
  await expect(page.locator("#saveDot")).toHaveText("Saved ✓");
  await expect(page.locator("#saveDot")).toHaveText("Synced");
});

test("shows Save failed when PUT returns 403 (expired Firebase rules)", async ({ frozenBrowser: page }) => {
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    } else if (route.request().method() === "PUT") {
      await route.fulfill({ status: 403, body: "Forbidden" });
    }
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');
  await page.click("#addPlayer");

  await expect(page.locator("#saveDot")).toContainText("Save failed");
});

// ─── Pull (pullRemote / Refresh button) ──────────────────────────────────────

test("Refresh button pulls latest state from Firebase", async ({ frozenBrowser: page }) => {
  // First load: no players
  await mockFirebase(page, { getResponse: emptyPool });
  await page.goto(DB_HASH);

  // Now remote has a player — override the route
  await mockFirebase(page, { getResponse: poolWithPlayers });

  await page.click("#refreshBtn");
  await expect(page.locator("#saveDot")).toHaveText("Synced");

  await page.click('[data-tab="pred"]');
  await expect(page.locator(".chip:not(.add)")).toHaveCount(2);
});

test("Refresh shows Offline when fetch fails mid-session", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, { getResponse: emptyPool });
  await page.goto(DB_HASH);

  // Simulate connection drop
  await page.route(POOL_URL, (route) => route.abort("failed"));
  await page.click("#refreshBtn");

  await expect(page.locator("#saveDot")).toHaveText("Offline");
});

// ─── Remote state merging ─────────────────────────────────────────────────────

test("remote predictions are visible on the predictions tab after load", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, { getResponse: poolWithPlayers });
  await page.goto(DB_HASH);

  await page.click('[data-tab="pred"]');
  await page.click(".chip:has-text('Alice')");

  // Alice predicted 2-1 for match 1 — value should be pre-filled
  await expect(page.locator('[data-pred="1:h"]')).toHaveValue("2");
  await expect(page.locator('[data-pred="1:a"]')).toHaveValue("1");
});

test("remote results are reflected in the results tab after load", async ({ frozenBrowser: page }) => {
  const poolWithResults = {
    ...emptyPool,
    players: [{ id: "p1", name: "Alice" }],
    predictions: { p1: { 1: { h: 1, a: 0 } } },
    results: { 1: { h: 3, a: 1, auto: true } },
  };

  await mockFirebase(page, { getResponse: poolWithResults });
  await page.goto(DB_HASH);

  await page.click('[data-tab="res"]');
  await expect(page.locator('[data-res="1:h"]')).toHaveValue("3");
  await expect(page.locator('[data-res="1:a"]')).toHaveValue("1");
});

// ─── predictionsLocked from remote ───────────────────────────────────────────

test("lockbanner appears on predictions tab when remote state has predictionsLocked true", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, {
    getResponse: { ...poolWithPlayers, predictionsLocked: true },
  });
  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');
  await expect(page.locator(".lockbanner")).toBeVisible();
});

test("prediction inputs are all disabled when predictionsLocked is true from remote", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, {
    getResponse: { ...poolWithPlayers, predictionsLocked: true },
  });
  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');
  const inputs = page.locator('[data-pred]');
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(inputs.nth(i)).toBeDisabled();
  }
});

// ─── officialPlayers from remote ─────────────────────────────────────────────

test("Official Board shows only official players from remote state", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, {
    getResponse: {
      ...poolWithPlayers,
      officialPlayers: ["p1"], // only Alice is official
    },
  });
  await page.goto(DB_HASH);
  await page.click('[data-tab="board"]');

  // Official Board (default) should show only Alice
  const rows = page.locator(".boardrow");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Alice");
});

test("Full Rankings shows all players regardless of officialPlayers", async ({ frozenBrowser: page }) => {
  await mockFirebase(page, {
    getResponse: {
      ...poolWithPlayers,
      officialPlayers: ["p1"],
    },
  });
  await page.goto(DB_HASH);
  await page.click('[data-tab="board"]');
  await page.click("#btabAll");

  await expect(page.locator(".boardrow")).toHaveCount(2);
});

// ─── Pull guards ──────────────────────────────────────────────────────────────

test("pullRemote does not overwrite state while prediction edit mode is active", async ({ frozenBrowser: page }) => {
  // Initial load: empty pool
  await mockFirebase(page, { getResponse: emptyPool });
  await page.goto(DB_HASH);

  // Add a player and enter edit mode
  await page.click('[data-tab="pred"]');
  await page.click("#addPlayer");
  // Edit mode is now active

  // Override route so next pull would return poolWithPlayers
  await mockFirebase(page, { getResponse: poolWithPlayers });

  // Click refresh — should be a no-op because editingPred is true
  await page.click("#refreshBtn");

  // The local player count should still be 1 (our added player), not 2
  await expect(page.locator(".chip:not(.add)")).toHaveCount(1);
});

// ─── mergeRemote fills gaps, does not overwrite local predictions ─────────────

test("local predictions are preserved when remote has a different value for the same match", async ({ frozenBrowser: page }) => {
  // Remote has Alice predicting 3-0 for match 1
  const remotePool = {
    ...emptyPool,
    players: [{ id: "p1", name: "Alice" }],
    predictions: { p1: { 1: { h: 3, a: 0 } } },
  };

  let callCount = 0;
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      // First call: load pool with existing prediction
      // Second call (Refresh): return same data — local prediction already set
      callCount++;
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(remotePool),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');

  // Alice's prediction for match 1 should be the remote value (3-0)
  await page.click(".chip:has-text('Alice')");
  await expect(page.locator('[data-pred="1:h"]')).toHaveValue("3");
  await expect(page.locator('[data-pred="1:a"]')).toHaveValue("0");
});

// ─── Save retry on failure ────────────────────────────────────────────────────

test("status shows Save failed when PUT returns a server error", async ({ frozenBrowser: page }) => {
  await page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPool) });
    } else if (route.request().method() === "PUT") {
      await route.fulfill({ status: 500, body: "Internal Server Error" });
    }
  });

  await page.goto(DB_HASH);
  await page.click('[data-tab="pred"]');
  await page.click("#addPlayer");

  await expect(page.locator("#saveDot")).toContainText("Save failed");
});
