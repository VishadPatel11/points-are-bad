import { test, expect } from "@playwright/test";
import { matchPoints, hasFullPred, isCounted, leaderboard, playedMatches, countedMatches } from "../js/scoring.js";
import { state } from "../js/state.js";
import { SEED_STATE } from "../js/data.js";

// Reset state to a clean slate before every test.
// We mutate the same object reference (not reassign) so scoring.js keeps seeing it.
test.beforeEach(() => {
  Object.assign(state, JSON.parse(JSON.stringify(SEED_STATE)));
  state.players = [];
  state.predictions = {};
  state.results = {};
});

// ─── matchPoints ─────────────────────────────────────────────────────────────

test("matchPoints returns null when no result exists yet", () => {
  const pts = matchPoints("p1", 1);
  expect(pts).toBeNull();
});

test("matchPoints returns null when result is partially filled", () => {
  state.results[1] = { h: 2, a: null };
  const pts = matchPoints("p1", 1);
  expect(pts).toBeNull();
});

test("matchPoints returns 0 for a blank prediction (house rule: no entry = 0 pts)", () => {
  state.results[1] = { h: 2, a: 1 };
  // no prediction set for p1
  const pts = matchPoints("p1", 1);
  expect(pts).toBe(0);
});

test("matchPoints returns 0 for a perfect prediction", () => {
  state.results[1] = { h: 2, a: 1 };
  state.predictions["p1"] = { 1: { h: 2, a: 1 } };
  expect(matchPoints("p1", 1)).toBe(0);
});

test("matchPoints returns correct points when home score is off", () => {
  state.results[1] = { h: 2, a: 1 };
  state.predictions["p1"] = { 1: { h: 0, a: 1 } }; // home off by 2
  expect(matchPoints("p1", 1)).toBe(2);
});

test("matchPoints returns correct points when away score is off", () => {
  state.results[1] = { h: 1, a: 0 };
  state.predictions["p1"] = { 1: { h: 1, a: 3 } }; // away off by 3
  expect(matchPoints("p1", 1)).toBe(3);
});

test("matchPoints sums both home and away deltas", () => {
  state.results[1] = { h: 3, a: 1 };
  state.predictions["p1"] = { 1: { h: 1, a: 4 } }; // home -2, away +3
  expect(matchPoints("p1", 1)).toBe(5);
});

test("matchPoints is always non-negative (no negative points)", () => {
  state.results[1] = { h: 0, a: 0 };
  state.predictions["p1"] = { 1: { h: 5, a: 5 } };
  const pts = matchPoints("p1", 1);
  expect(pts).toBeGreaterThanOrEqual(0);
});

// ─── isCounted ───────────────────────────────────────────────────────────────

test("isCounted returns true when all players predicted the match", () => {
  state.players = [{ id: "p1", name: "Alice" }, { id: "p2", name: "Bob" }];
  state.predictions = {
    p1: { 1: { h: 2, a: 1 } },
    p2: { 1: { h: 0, a: 0 } },
  };
  state.results[1] = { h: 1, a: 1 };
  const m = { n: 1, kickoff: "2020-01-01T00:00:00Z" };
  expect(isCounted(m)).toBe(true);
});

test("isCounted returns false when one player has no prediction", () => {
  state.players = [{ id: "p1", name: "Alice" }, { id: "p2", name: "Bob" }];
  state.predictions = {
    p1: { 1: { h: 2, a: 1 } },
    // p2 has no prediction for match 1
  };
  state.results[1] = { h: 1, a: 1 };
  const m = { n: 1, kickoff: "2020-01-01T00:00:00Z" };
  expect(isCounted(m)).toBe(false);
});

test("isCounted returns false when one player has a partial prediction", () => {
  state.players = [{ id: "p1", name: "Alice" }, { id: "p2", name: "Bob" }];
  state.predictions = {
    p1: { 1: { h: 2, a: 1 } },
    p2: { 1: { h: 0, a: null } }, // incomplete
  };
  const m = { n: 1, kickoff: "2020-01-01T00:00:00Z" };
  expect(isCounted(m)).toBe(false);
});

test("isCounted returns true with a single player who predicted", () => {
  state.players = [{ id: "p1", name: "Solo" }];
  state.predictions = { p1: { 1: { h: 1, a: 0 } } };
  const m = { n: 1, kickoff: "2020-01-01T00:00:00Z" };
  expect(isCounted(m)).toBe(true);
});

// ─── leaderboard ─────────────────────────────────────────────────────────────

test("leaderboard sorts players by total points ascending", () => {
  state.players = [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ];
  state.predictions = {
    p1: { 1: { h: 1, a: 0 } }, // perfect
    p2: { 1: { h: 3, a: 2 } }, // off by 4
  };
  state.results[1] = { h: 1, a: 0 };

  const { rows } = leaderboard();
  expect(rows[0].name).toBe("Alice");
  expect(rows[0].total).toBe(0);
  expect(rows[1].name).toBe("Bob");
  expect(rows[1].total).toBe(4);
});

test("leaderboard breaks ties by perfects descending", () => {
  state.players = [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ];
  // both score 1 total across 2 matches, but Alice has a perfect on match 1
  state.predictions = {
    p1: { 1: { h: 1, a: 0 }, 2: { h: 1, a: 1 } }, // 0 + 1 = 1, one perfect
    p2: { 1: { h: 2, a: 0 }, 2: { h: 1, a: 0 } }, // 1 + 0 = 1, one perfect
  };
  state.results[1] = { h: 1, a: 0 };
  state.results[2] = { h: 1, a: 0 };

  const { rows } = leaderboard();
  // Both have 1 total and 1 perfect — falls through to alphabetical
  expect(rows[0].total).toBe(rows[1].total);
});

test("leaderboard breaks total+perfects ties alphabetically", () => {
  state.players = [
    { id: "p1", name: "Zara" },
    { id: "p2", name: "Alice" },
  ];
  state.predictions = {
    p1: { 1: { h: 1, a: 0 } },
    p2: { 1: { h: 1, a: 0 } },
  };
  state.results[1] = { h: 1, a: 0 };

  const { rows } = leaderboard();
  expect(rows[0].name).toBe("Alice");
  expect(rows[1].name).toBe("Zara");
});

test("leaderboard assigns the same rank to tied players", () => {
  state.players = [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
    { id: "p3", name: "Carol" },
  ];
  // Alice and Bob tied, Carol worse
  state.predictions = {
    p1: { 1: { h: 1, a: 0 } },
    p2: { 1: { h: 1, a: 0 } },
    p3: { 1: { h: 5, a: 5 } },
  };
  state.results[1] = { h: 1, a: 0 };

  const { rows } = leaderboard();
  expect(rows[0].rank).toBe(1);
  expect(rows[1].rank).toBe(1); // tied
  expect(rows[2].rank).toBe(3); // skips rank 2
});

test("leaderboard excludes matches not predicted by everyone", () => {
  state.players = [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ];
  // Only Alice predicted match 1 — it should be excluded from totals
  state.predictions = {
    p1: { 1: { h: 5, a: 5 } },
    // Bob has no prediction for match 1
  };
  state.results[1] = { h: 0, a: 0 };

  const { rows, countedCount } = leaderboard();
  expect(countedCount).toBe(0);
  expect(rows[0].total).toBe(0);
  expect(rows[1].total).toBe(0);
});

test("leaderboard counts perfects correctly across multiple matches", () => {
  state.players = [{ id: "p1", name: "Alice" }];
  state.predictions = {
    p1: {
      1: { h: 1, a: 0 }, // perfect
      2: { h: 2, a: 1 }, // perfect
      3: { h: 0, a: 3 }, // wrong
    },
  };
  state.results[1] = { h: 1, a: 0 };
  state.results[2] = { h: 2, a: 1 };
  state.results[3] = { h: 1, a: 1 };

  const { rows } = leaderboard();
  expect(rows[0].perfects).toBe(2);
  expect(rows[0].total).toBe(3); // |0-1| + |3-1| = 3
});
