import {
  state, activePlayer, editingPred, editingRes, boardView,
  setTab, setActivePlayer, setEditingPred, setEditingRes, setBoardView,
  pendingRemovals
} from "./state.js";
import { clampScore, isLocked } from "./scoring.js";
import { queueSave, setDot } from "./sync.js";
import { connectPool, pullRemote } from "./sync.js";
import { autoFetchResults } from "./fetch.js";
import { render, viewBoard } from "./render.js";

export function registerEvents() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.tab) {
      setTab(t.dataset.tab);
      setEditingPred(false);
      setEditingRes(false);
      render();
    } else if (t.id === "btabOfficial") { setBoardView("official"); render(); }
    else if (t.id === "btabAll")        { setBoardView("all"); render(); }
    else if (t.id === "lockAllBtn") {
      const msg = state.predictionsLocked
        ? "Unlock predictions? Players will be able to edit again (up to kickoff time)."
        : "Lock ALL predictions right now? No one will be able to make any more changes.";
      if (confirm(msg)) { state.predictionsLocked = !state.predictionsLocked; setEditingPred(false); render(); queueSave(); }
    }
    else if (t.id === "autoOfficialBtn") { state.officialPlayers = null; render(); queueSave(); }
    else if (t.id === "allOfficialBtn")  { state.officialPlayers = state.players.map(p => p.id); render(); queueSave(); }
    else if (t.id === "noneOfficialBtn") { state.officialPlayers = []; render(); queueSave(); }
    else if (t.dataset.player) { setActivePlayer(t.dataset.player); setEditingPred(false); render(); }
    else if (t.id === "togglePredEdit") {
      setEditingPred(!editingPred);
      if (!editingPred) queueSave(); else render();
    }
    else if (t.id === "toggleResEdit") {
      setEditingRes(!editingRes);
      if (!editingRes) queueSave(); else render();
    }
    else if (t.id === "addPlayer") {
      if (state.players.length >= 12) return;
      const id = "p" + (Math.max(0, ...state.players.map(p => parseInt(p.id.slice(1)) || 0)) + 1);
      state.players.push({ id, name: "Player " + (state.players.length + 1) });
      setActivePlayer(id);
      setEditingPred(true);
      render(); queueSave();
    }
    else if (t.id === "removePlayer") {
      if (state.players.length <= 1) return;
      if (!confirm("Remove this player and their predictions for everyone?")) return;
      const removedId = activePlayer;
      pendingRemovals.add(removedId);
      state.players = state.players.filter(p => p && p.id !== removedId);
      delete state.predictions[removedId];
      if (Array.isArray(state.officialPlayers)) {
        state.officialPlayers = state.officialPlayers.filter(id => id !== removedId);
      }
      setActivePlayer((state.players[0] || {}).id || "");
      render(); queueSave();
    }
    else if (t.id === "copyBtn") {
      const inp = document.querySelector("#shareLink");
      inp.select();
      navigator.clipboard ? navigator.clipboard.writeText(inp.value) : document.execCommand("copy");
      t.textContent = "Copied!";
      setTimeout(() => { t.textContent = "Copy link"; }, 1500);
    }
    else if (t.id === "testFetch")  { setDot("Fetching…", true); autoFetchResults(true); }
    else if (t.id === "connectBtn") { connectPool((document.querySelector("#dbInput") || {}).value); }
    else if (t.id === "refreshBtn") { pullRemote(true); }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.pred) {
      const [n, side] = t.dataset.pred.split(":");
      const m = MATCHES_BY_N[+n];
      if (isLocked(m)) return;
      const p   = state.predictions[activePlayer] = state.predictions[activePlayer] || {};
      const cur = p[n] = p[n] || {h: null, a: null};
      cur[side] = clampScore(t.value);
      schedulePartialSave();
    } else if (t.dataset.res) {
      const [n, side] = t.dataset.res.split(":");
      const r = state.results[n] = state.results[n] || {h: null, a: null};
      r[side] = clampScore(t.value);
      schedulePartialSave();
    } else if (t.id === "renameInput") {
      const p = state.players.find(x => x.id === activePlayer);
      if (p) p.name = t.value || "Player";
      schedulePartialSave();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.offpid) {
      let cur = state.officialPlayers ? [...state.officialPlayers] : state.players.map(p => p.id);
      if (t.checked) { if (!cur.includes(t.dataset.offpid)) cur.push(t.dataset.offpid); }
      else           { cur = cur.filter(id => id !== t.dataset.offpid); }
      state.officialPlayers = cur;
      if (document.querySelector("#view") && document.querySelector('[data-tab="board"].on')) {
        document.querySelector("#view").innerHTML = viewBoard();
      }
      queueSave();
    }
  });

  document.addEventListener("focusout", (e) => {
    if (e.target.tagName === "INPUT" && e.target.id !== "shareLink" && e.target.id !== "dbInput" && !editingPred && !editingRes) {
      setTimeout(render, 100);
    }
  });
}

// Lookup map built once so the input handler doesn't have to import MATCHES
import { MATCHES } from "./data.js";
import { countedMatches, playedMatches } from "./scoring.js";

const MATCHES_BY_N = Object.fromEntries(MATCHES.map(m => [m.n, m]));

let partialTimer = null;
function schedulePartialSave() {
  document.querySelector("#playedSub").textContent =
    "Lowest total wins · " + countedMatches().length + " of " + playedMatches().length + " played matches counted";
  clearTimeout(partialTimer);
  partialTimer = setTimeout(() => {
    if (!(document.activeElement && document.activeElement.tagName === "INPUT")) render();
    queueSave();
  }, 900);
}
