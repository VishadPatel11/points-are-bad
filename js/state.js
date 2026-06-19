import { SEED_STATE } from "./data.js";

export let state = JSON.parse(JSON.stringify(SEED_STATE));
export let dbUrl = null;
export let tab = "board";
export let activePlayer = "p1";
export let saveTimer = null;
export let online = false;
export let editingPred = false;
export let editingRes = false;
export let boardView = "official";
export let adminPanelOpen = false;
export let pendingRemovals = new Set();

export function setState(patch) { Object.assign(state, patch); }
export function setDbUrl(u) { dbUrl = u; }
export function setTab(t) { tab = t; }
export function setActivePlayer(id) { activePlayer = id; }
export function setSaveTimer(t) { saveTimer = t; }
export function setOnline(v) { online = v; }
export function setEditingPred(v) { editingPred = v; }
export function setEditingRes(v) { editingRes = v; }
export function setBoardView(v) { boardView = v; }
export function setAdminPanelOpen(v) { adminPanelOpen = v; }

export function sanitizeState(s) {
  if (!s) return JSON.parse(JSON.stringify(SEED_STATE));
  if (!Array.isArray(s.players)) s.players = [];
  s.players = s.players.filter(p => p != null && p.id);
  if (!s.predictions || typeof s.predictions !== "object") s.predictions = {};
  if (!s.results || typeof s.results !== "object") s.results = {};
  if (s.predictionsLocked === undefined) s.predictionsLocked = false;
  if (s.officialPlayers !== undefined && !Array.isArray(s.officialPlayers) && s.officialPlayers !== null) s.officialPlayers = null;

  // deduplicate players by name — keep the one with more predictions
  const nameMap = new Map();
  s.players.forEach(p => {
    const key = (p.name || "").toLowerCase().trim();
    if (!nameMap.has(key)) {
      nameMap.set(key, p);
    } else {
      const existing = nameMap.get(key);
      const existCount = Object.keys(s.predictions[existing.id] || {}).length;
      const newCount   = Object.keys(s.predictions[p.id] || {}).length;
      const keeper  = newCount > existCount ? p : existing;
      const discard = newCount > existCount ? existing : p;
      if (!s.predictions[keeper.id]) s.predictions[keeper.id] = {};
      Object.keys(s.predictions[discard.id] || {}).forEach(m => {
        if (!s.predictions[keeper.id][m]) s.predictions[keeper.id][m] = s.predictions[discard.id][m];
      });
      delete s.predictions[discard.id];
      nameMap.set(key, keeper);
    }
  });
  s.players = Array.from(nameMap.values());
  return s;
}

export function mergeRemote(remote, local) {
  const out = sanitizeState(JSON.parse(JSON.stringify(remote || SEED_STATE)));
  out.players = out.players || [];
  out.predictions = out.predictions || {};

  (local.players || []).filter(lp => lp && lp.id).forEach(lp => {
    const byId   = out.players.findIndex(p => p && p.id === lp.id);
    const byName = byId === -1
      ? out.players.findIndex(p => p && (p.name || "").toLowerCase().trim() === (lp.name || "").toLowerCase().trim())
      : -1;

    let targetId;
    if (byId !== -1) {
      targetId = lp.id;
    } else if (byName !== -1) {
      targetId = out.players[byName].id;
    } else {
      out.players.push(lp);
      targetId = lp.id;
    }

    if (!out.predictions[targetId]) out.predictions[targetId] = {};
    Object.keys(local.predictions[lp.id] || {}).forEach(m => {
      if (!out.predictions[targetId][m]) out.predictions[targetId][m] = local.predictions[lp.id][m];
    });
  });

  out.results = Object.assign({}, out.results || {}, local.results || {});
  if (local.apiKey) out.apiKey = local.apiKey;
  if (out.predictionsLocked === undefined) out.predictionsLocked = false;
  if (out.officialPlayers === undefined) out.officialPlayers = null;

  const validIds = new Set(out.players.map(p => p.id));
  Object.keys(out.predictions).forEach(pid => {
    if (!validIds.has(pid)) delete out.predictions[pid];
  });

  return out;
}
