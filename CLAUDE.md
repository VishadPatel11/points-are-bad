# Points Are Bad — AI Onboarding Guide

This file is for AI assistants (Claude, Cursor, Copilot, Gemini, etc.). Read this before touching any code.

---

## What this app is

A family prediction pool app for tournaments (currently World Cup). Players predict match scores before kickoff. Lower total score difference = better. The name is ironic — points are bad here.

No build step. No framework. Vanilla JS ES modules served by a static file server. Firebase Realtime Database is optional — the app works fully offline/locally without it.

---

## Essential commands

```bash
# Run the app locally
python3 -m http.server 8080
# then open http://localhost:8080

# Run all tests
npm test

# Interactive test UI (best for debugging a failing test)
npm run test:ui

# Run a single test file
npx playwright test tests/scoring.spec.js

# Run tests matching a name
npx playwright test --grep "leaderboard"
```

Always run `npm test` to verify your changes before considering a task done.

---

## Project structure

```
index.html          — Shell only. One <script type="module" src="js/main.js">
css/main.css        — All styles
js/
  data.js           — MATCHES array, FLAGS, SEED_STATE. Change this for a new tournament.
  state.js          — Shared mutable state + setter functions. Single source of truth.
  scoring.js        — Pure functions: matchPoints, isCounted, leaderboard, isLocked
  sync.js           — Firebase: dbFromHash, connectPool, pullRemote, queueSave
  render.js         — All view*/render* DOM functions
  events.js         — Delegated event listeners
  fetch.js          — ESPN auto-score fetching
  main.js           — Boot: wires everything together, starts intervals
tests/
  fixtures.js       — Shared Playwright fixtures (see Tests section)
  scoring.spec.js   — Unit tests for scoring logic, no browser
  app.spec.js       — Browser tests for UI behaviour
  sync.spec.js      — Browser tests for Firebase sync (mocked)
  README.md         — Full test documentation
```

---

## Key architecture rules

**`data.js` is the only file that changes between tournaments.**
To reuse this app for a different sport or tournament, swap `MATCHES` in `data.js`. Everything else is generic.

**No circular imports between fetch.js and render.js.**
`fetch.js` exposes `liveSet` via `window.__pab_fetch__ = { liveSet }`. `render.js` reads it from `window.__pab_fetch__` rather than importing directly. Do not break this pattern.

**State lives in `state.js` only.**
Never mutate `state` directly from other modules. Use the exported setter functions (`setState`, `setDbUrl`, `setActivePlayer`, etc.).

**`package.json` must stay `"type": "module"`.**
The project uses ES modules throughout. Changing this to `"commonjs"` breaks Playwright with Node 22.

---

## Tests — what you need to know

### Time is frozen in browser tests

Prediction inputs lock at each match's real kickoff time. Tests that touch inputs use a frozen `Date.now()` via Playwright fixtures. Without this, tests break silently as real matches kick off.

Import from `./fixtures.js`, not `@playwright/test`:

```js
import { test, expect } from "./fixtures.js";
```

### Three fixtures

| Fixture         | When to use                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| `frozenPage`    | Any UI test that touches prediction inputs or lock state                         |
| `predPage`      | Tests that go straight to filling in scores (tab + player + edit already set up) |
| `frozenBrowser` | Sync tests — set up `page.route()` mocks BEFORE calling `page.goto()`            |

### Firebase is always mocked in tests

Never use a real Firebase project in tests. Use `page.route(POOL_URL, ...)` to intercept fetch calls. See `tests/sync.spec.js` for the standard `mockFirebase` helper pattern.

### Test layers

- **scoring.spec.js** — pure logic, no browser, ~1s. Put calculation tests here.
- **app.spec.js** — UI flows, ~10s. Put "clicking X does Y" tests here.
- **sync.spec.js** — Firebase behaviour, ~11s. Put save/load/error tests here.

### Test conventions

- Test behaviours, not data. Don't hardcode match counts or team names.
- `expect(count).toBeGreaterThan(0)` over `expect(count).toBe(15)`.
- Register `page.route()` before `page.goto()` in sync tests.

---

## Non-obvious gotchas

**`addInitScript` serializes the function as a string.**
Any variables referenced inside the freeze function must be literals — module-scope variables won't exist in the browser context. The date string `"2020-01-01T00:00:00Z"` must be a literal inside `freezeTime`, not a constant defined above it.

**`pullRemote` vs `connectPool` are different flows.**

- `connectPool` = user clicks Connect button → GET then PUT if null (creates new pool)
- `pullRemote` = hash-based auto-load on page open, or Refresh button → GET only

**Firebase sync only fires when `dbUrl` is set.**
If no `#db=` hash is in the URL, the app runs fully local. `queueSave` and `pullRemote` both no-op when `dbUrl` is null.

**The `pendingRemovals` set prevents race conditions.**
When a player is deleted locally and a remote pull happens before the save completes, `pendingRemovals` ensures the deleted player isn't re-added from the remote state.

---

## CI

GitHub Actions runs all tests on every push/PR to `main`. See [.github/workflows/ci.yml](.github/workflows/ci.yml). If CI is red, run `npm test` locally first — Playwright uploads a report artifact on failure.
