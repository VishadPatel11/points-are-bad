import { MATCHES } from "./data.js";
import { state } from "./state.js";

export const num = (v) => (v === null || v === undefined) ? null : v;
export const isLocked = (m) => Date.now() >= new Date(m.kickoff).getTime();
export const clampScore = (v) => {
  if (v === "" || v == null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : Math.max(0, Math.min(20, n));
};

export function matchPoints(pid, n) {
  const r = state.results[n];
  if (!r || num(r.h) === null || num(r.a) === null) return null;
  const pred = (state.predictions[pid] || {})[n];
  if (!pred || num(pred.h) === null || num(pred.a) === null) return 0;
  return Math.abs(pred.h - r.h) + Math.abs(pred.a - r.a);
}

export function hasFullPred(pid, n) {
  const pred = (state.predictions[pid] || {})[n];
  return !!(pred && num(pred.h) !== null && num(pred.a) !== null);
}

export function hasFullEntries(pid) {
  const p = state.predictions[pid] || {};
  return MATCHES.every(m => { const e = p[m.n]; return e && num(e.h) !== null && num(e.a) !== null; });
}

export function getOfficialIds() {
  if (state.officialPlayers) return state.officialPlayers;
  return state.players.filter(p => hasFullEntries(p.id)).map(p => p.id);
}

export function playedMatches() {
  return MATCHES.filter(m => { const r = state.results[m.n]; return r && num(r.h) !== null && num(r.a) !== null; });
}

export function isCounted(m) {
  return state.players.every(p => hasFullPred(p.id, m.n));
}

export function countedMatches() {
  return playedMatches().filter(isCounted);
}

export function leaderboard() {
  const counted = countedMatches();
  const rows = state.players.map(p => {
    let total = 0, perfects = 0;
    counted.forEach(m => {
      const pts = matchPoints(p.id, m.n);
      total += pts;
      if (pts === 0) perfects++;
    });
    return Object.assign({}, p, { total, perfects, counted: counted.length });
  });
  rows.sort((a, b) => a.total - b.total || b.perfects - a.perfects || a.name.localeCompare(b.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (prev === null || r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = rank; });
  return { rows, playedCount: playedMatches().length, countedCount: counted.length };
}
