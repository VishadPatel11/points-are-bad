import { test as base } from "@playwright/test";

// ─── Time freeze ─────────────────────────────────────────────────────────────
// addInitScript serializes the function body into the browser — the date string
// must be a literal inside the function, not a module-scope variable reference.
const freezeTime = () => {
  const _Date = Date;
  globalThis.Date = class extends _Date {
    static now() { return new _Date("2020-01-01T00:00:00Z").getTime(); }
  };
};

// ─── Firebase mock constants ──────────────────────────────────────────────────
export const FAKE_DB  = "https://test-project-default-rtdb.firebaseio.com";
export const POOL_URL = `${FAKE_DB}/pab-wc2026.json`;
export const DB_HASH  = `/#db=${encodeURIComponent(FAKE_DB)}`;

// ─── Fixtures ─────────────────────────────────────────────────────────────────
export const test = base.extend({
  // Time frozen, no navigation — use when you need to set up page.route()
  // before the first goto (e.g. sync tests that mock Firebase responses).
  frozenBrowser: async ({ page }, use) => {
    await page.addInitScript(freezeTime);
    await use(page);
  },

  // Time frozen + goto "/" — general UI tests where no db is connected.
  frozenPage: async ({ page }, use) => {
    await page.addInitScript(freezeTime);
    await page.goto("/");
    await use(page);
  },

  // Time frozen + Predictions tab + one player added + edit mode active.
  predPage: async ({ page }, use) => {
    await page.addInitScript(freezeTime);
    await page.goto("/");
    await page.click('[data-tab="pred"]');
    await page.click("#addPlayer");
    await use(page);
  },
});

export { expect } from "@playwright/test";
