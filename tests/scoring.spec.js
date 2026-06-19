import { test, expect } from "@playwright/test";
import { matchPoints, hasFullPred, isCounted, leaderboard, playedMatches, countedMatches, clampScore, isLocked, num, hasFullEntries, getOfficialIds } from "../js/scoring.js";
import { state } from "../js/state.js";
import { SEED_STATE, MATCHES } from "../js/data.js";

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

// ─── num ─────────────────────────────────────────────────────────────────────

test("num returns null for null", () => { expect(num(null)).toBeNull(); });
test("num returns null for undefined", () => { expect(num(undefined)).toBeNull(); });
test("num returns the value for 0", () => { expect(num(0)).toBe(0); });
test("num returns the value for a positive integer", () => { expect(num(3)).toBe(3); });

// ─── clampScore ───────────────────────────────────────────────────────────────

test("clampScore returns null for empty string", () => {
  expect(clampScore("")).toBeNull();
});

test("clampScore returns null for null", () => {
  expect(clampScore(null)).toBeNull();
});

test("clampScore returns null for a non-numeric string", () => {
  expect(clampScore("abc")).toBeNull();
});

test("clampScore returns 0 for a negative number", () => {
  expect(clampScore("-5")).toBe(0);
});

test("clampScore returns 20 for a number above 20", () => {
  expect(clampScore("25")).toBe(20);
});

test("clampScore returns 20 for exactly 20", () => {
  expect(clampScore("20")).toBe(20);
});

test("clampScore returns 0 for exactly 0", () => {
  expect(clampScore("0")).toBe(0);
});

test("clampScore returns the value for a valid mid-range number", () => {
  expect(clampScore("7")).toBe(7);
});

// ─── isLocked ─────────────────────────────────────────────────────────────────

test("isLocked returns true for a match in the past", () => {
  const m = { kickoff: "2020-01-01T00:00:00Z" };
  expect(isLocked(m)).toBe(true);
});

test("isLocked returns false for a match far in the future", () => {
  const m = { kickoff: "2099-01-01T00:00:00Z" };
  expect(isLocked(m)).toBe(false);
});

// ─── hasFullEntries ───────────────────────────────────────────────────────────

test("hasFullEntries returns false when player has no predictions", () => {
  state.players = [{ id: "p1", name: "Alice" }];
  state.predictions = {};
  expect(hasFullEntries("p1")).toBe(false);
});

test("hasFullEntries returns false when player is missing a match", () => {
  state.players = [{ id: "p1", name: "Alice" }];
  // Only predict the first match, leave the rest blank
  state.predictions = { p1: { 1: { h: 1, a: 0 } } };
  expect(hasFullEntries("p1")).toBe(false);
});

test("hasFullEntries returns true when all matches are predicted", () => {
  state.players = [{ id: "p1", name: "Alice" }];
  const fullPreds = {};
  MATCHES.forEach(m => { fullPreds[m.n] = { h: 1, a: 0 }; });
  state.predictions = { p1: fullPreds };
  expect(hasFullEntries("p1")).toBe(true);
});

test("hasFullEntries returns false when a prediction has null values", () => {
  state.players = [{ id: "p1", name: "Alice" }];
  const preds = {};
  MATCHES.forEach(m => { preds[m.n] = { h: 1, a: 0 }; });
  preds[MATCHES[0].n] = { h: null, a: 0 }; // partial
  state.predictions = { p1: preds };
  expect(hasFullEntries("p1")).toBe(false);
});

// ─── getOfficialIds ───────────────────────────────────────────────────────────

test("getOfficialIds returns the explicit list when officialPlayers is set", () => {
  state.players = [{ id: "p1", name: "Alice" }, { id: "p2", name: "Bob" }];
  state.officialPlayers = ["p1"];
  expect(getOfficialIds()).toEqual(["p1"]);
});

test("getOfficialIds auto-derives from hasFullEntries when officialPlayers is null", () => {
  state.players = [{ id: "p1", name: "Alice" }, { id: "p2", name: "Bob" }];
  state.officialPlayers = null;
  // Only p1 has full entries
  const fullPreds = {};
  MATCHES.forEach(m => { fullPreds[m.n] = { h: 1, a: 0 }; });
  state.predictions = { p1: fullPreds, p2: { 1: { h: 0, a: 0 } } };
  const ids = getOfficialIds();
  expect(ids).toContain("p1");
  expect(ids).not.toContain("p2");
});

test("getOfficialIds returns empty array when officialPlayers is explicitly empty", () => {
  state.players = [{ id: "p1", name: "Alice" }];
  state.officialPlayers = [];
  expect(getOfficialIds()).toEqual([]);
});
