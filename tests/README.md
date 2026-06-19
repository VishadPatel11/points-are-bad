# Test Suite

This document covers how the tests are structured, how to run them, and the conventions to follow when adding new ones.

---

## Quick start

```bash
npm test              # run everything headlessly
npm run test:ui       # open Playwright's interactive UI (best for debugging)
npm run test:debug    # step through a test one action at a time
```

To run a single file or a specific test by name:

```bash
npx playwright test tests/scoring.spec.js
npx playwright test --grep "leaderboard sorts"
```

---

## Structure

```
tests/
├── fixtures.js       # Shared fixtures (frozen time, Firebase mock constants)
├── scoring.spec.js   # Unit tests — pure scoring logic, no browser
├── app.spec.js       # Browser tests — UI behaviour and flows
├── sync.spec.js      # Browser tests — Firebase sync, mocked with page.route()
└── README.md         # This file
```

### Three layers, three jobs

| File | What it tests | Browser? | Speed |
|---|---|---|---|
| `scoring.spec.js` | `matchPoints`, `isCounted`, `leaderboard` | No | ~1s |
| `app.spec.js` | Tabs, predictions, results, player management | Yes | ~10s |
| `sync.spec.js` | Firebase connect, pull, save, error states | Yes (mocked) | ~11s |

---

## fixtures.js

All shared setup lives in `fixtures.js`. Import from here instead of `@playwright/test` directly so you get the custom fixtures automatically.

```js
import { test, expect, FAKE_DB, POOL_URL, DB_HASH } from "./fixtures.js";
```

### Available fixtures

#### `frozenPage`
Time frozen to Jan 2020 + navigated to `/`. Use for any UI test that touches prediction inputs or lock state — prevents real match kickoff times from disabling inputs and breaking tests as the tournament progresses.

```js
test("all inputs are open", async ({ frozenPage: page }) => {
  await page.click('[data-tab="pred"]');
  // every match is in the future — no inputs are locked
});
```

#### `predPage`
`frozenPage` + already on the Predictions tab + one player added + edit mode active. Use when you want to skip the setup and go straight to filling in scores.

```js
test("can fill in a score", async ({ predPage: page }) => {
  await page.locator('[data-pred]').nth(0).fill("2");
});
```

#### `frozenBrowser`
Time frozen, no navigation. Use for sync tests that need to register `page.route()` mocks before the first `page.goto()` — routes must be in place before the page loads or the initial Firebase request slips through unmocked.

```js
test("loads pool from Firebase", async ({ frozenBrowser: page }) => {
  await page.route(POOL_URL, async (route) => { /* mock */ });
  await page.goto(DB_HASH); // navigate AFTER the route is set up
});
```

### Firebase mock constants

| Export | Value |
|---|---|
| `FAKE_DB` | `https://test-project-default-rtdb.firebaseio.com` |
| `POOL_URL` | `FAKE_DB + /pab-wc2026.json` |
| `DB_HASH` | `/#db=<encoded FAKE_DB>` — navigates as if you have a real pool connected |

---

## Why time is frozen

The app locks prediction inputs at each match's real kickoff time using `Date.now()`. Without freezing time, tests that interact with score inputs break progressively as matches kick off — and they break silently (no error, just a timeout waiting for an input that will never be enabled).

`frozenPage` and `predPage` both inject this before any page JS runs:

```js
const freezeTime = () => {
  const _Date = Date;
  globalThis.Date = class extends _Date {
    static now() { return new _Date("2020-01-01T00:00:00Z").getTime(); }
  };
};
```

This means every match is always in the future, every input is always open, and the test suite stays green regardless of what date it runs on.

**Important:** the date string must be a literal inside the function body. `addInitScript` serialises the function as a string and runs it in the browser — any module-scope variables referenced by the function won't exist in that context.

---

## Why Firebase is mocked

The sync tests use `page.route()` to intercept all `fetch` calls to the Firebase URL and return controlled responses. This means:

- Tests run offline with no Firebase project needed
- Each test controls exactly what the "database" returns
- Error scenarios (403, network failure) are trivially reproducible
- Tests are fast and deterministic

The standard helper used across sync tests:

```js
function mockFirebase(page, { getResponse = null, putStatus = 200 } = {}) {
  return page.route(POOL_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(getResponse),
      });
    } else if (route.request().method() === "PUT") {
      await route.fulfill({ status: putStatus, contentType: "application/json", body: "true" });
    } else {
      await route.continue();
    }
  });
}
```

For more specific assertions (e.g. inspecting the PUT body), register the route manually in the test so you can capture the payload.

---

## Conventions

**Use `frozenPage` or `predPage` for any test that touches prediction inputs.** Never rely on `:not([disabled])` selectors to work around kickoff locking — that's masking the problem. If inputs are locked when you don't expect them to be, you're missing the fixture.

**Test behaviours, not data.** Avoid hardcoding match counts, team names, or sport-specific copy. The app is designed to be reusable with different fixture sets (`data.js`). A test like `toHaveCount(15)` breaks the moment you change the fixture list. Prefer:

```js
// Bad
await expect(page.locator(".mcard")).toHaveCount(15);

// Good
const count = await page.locator(".mcard").count();
expect(count).toBeGreaterThan(0);
```

**Unit tests for logic, browser tests for flows.** If you're testing that a calculation returns the right number, put it in `scoring.spec.js` — no browser needed, runs in milliseconds. If you're testing that clicking a button does the right thing, put it in `app.spec.js` or `sync.spec.js`.

**Register routes before `goto`.** In sync tests, `page.route()` must be called before `page.goto()`. The app fires a Firebase GET immediately on load when a `#db=` hash is present — if the route isn't registered yet, the real request goes out.

---

## Tests catching real bugs — a concrete example

> Writing tests found a bug that had been silently breaking the app in production.

During the initial sync test run, the test **"shows Synced status after a successful pull"** kept failing with `Received: "Offline"` — even though our mock was returning a valid 200 response.

Investigating the root cause: `pullRemote` in `sync.js` was crashing with an unhandled exception that was being silently swallowed by the try/catch:

```js
// sync.js — before the fix
if (!state.players.length) setState(JSON.parse(JSON.stringify(SEED_STATE)));
if (!state.players.find(p => p.id === activePlayer)) setActivePlayer(state.players[0].id);
//                                                                              ^^^^^^^^^^^
// state.players[0] is undefined when the array is empty — TypeError thrown here
// catch block sets status to "Offline" and the real error is never surfaced
```

When a pool with 0 players was loaded from Firebase (a valid state for a freshly connected pool), `state.players[0]` was `undefined`, calling `.id` on it threw a `TypeError`, the catch block set the status to "Offline", and the user saw the app appear broken with no explanation.

**The fix was one line:**

```js
// sync.js — after the fix
if (state.players.length && !state.players.find(p => p.id === activePlayer)) {
  setActivePlayer(state.players[0].id);
}
```

This bug had no visible error in the console during normal use because the catch block absorbed it. Manual testing wouldn't catch it easily either — you'd have to connect a brand-new empty pool and notice the "Offline" status, which looks like a network issue rather than a code bug. The test made the failure unambiguous and pointed directly at the cause.

---

## Adding new tests

1. Pick the right file — scoring logic → `scoring.spec.js`, UI flow → `app.spec.js`, Firebase → `sync.spec.js`
2. Use `frozenPage` or `predPage` if your test touches prediction inputs
3. Use `frozenBrowser` + `page.route()` if your test involves Firebase calls
4. Keep assertions behaviour-focused — what the user sees, not what the data is
5. Run the full suite before opening a PR: `npm test`
