import { SEED_STATE } from "./data.js";
import {
  state, dbUrl, saveTimer, online, editingPred, editingRes, pendingRemovals,
  setState, setDbUrl, setSaveTimer, setOnline, activePlayer, setActivePlayer,
  sanitizeState, mergeRemote
} from "./state.js";
import { render } from "./render.js";

const POOL_PATH = "/pab-wc2026.json";

export function dbFromHash() {
  const m = location.hash.match(/db=([^&]+)/);
  if (!m) return null;
  try {
    const u = decodeURIComponent(m[1]).replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(u)) return null;
    return u;
  } catch (e) { return null; }
}

export function setDot(txt, on) {
  const d = document.querySelector("#saveDot");
  d.textContent = txt;
  d.className = "savedot" + (on ? " on" : "");
}

export async function connectPool(rawUrl) {
  let u = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!u) { alert("Paste your Firebase database URL first."); return; }
  if (!/^https:\/\//i.test(u)) u = "https://" + u;
  if (!/\.(firebaseio\.com|firebasedatabase\.app)$/i.test(u)) {
    alert("That doesn't look like a Firebase database URL. It should end in .firebaseio.com or .firebasedatabase.app — copy it from the top of the Realtime Database page.");
    return;
  }
  setDot("Connecting…", true);
  try {
    const res = await fetch(u + POOL_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const existing = await res.json();
    if (existing) {
      setState(mergeRemote(existing, state));
    } else {
      const put = await fetch(u + POOL_PATH, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(state) });
      if (!put.ok) throw new Error("HTTP " + put.status);
    }
    setDbUrl(u);
    location.hash = "db=" + encodeURIComponent(u);
    setOnline(true);
    setDot("Synced", false);
    render();
  } catch (e) {
    setOnline(false);
    setDot("Offline", false);
    alert("Couldn't reach that database (" + e.message + "). Double-check the URL, and make sure the database was created in test mode so reads/writes are allowed.");
    render();
  }
}

export async function pullRemote(showStatus) {
  if (!dbUrl) return;
  if (editingPred || editingRes) return;
  if (saveTimer) return;
  if (document.activeElement && document.activeElement.tagName === "INPUT") return;
  try {
    if (showStatus) setDot("Syncing…", true);
    const res = await fetch(dbUrl + POOL_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const remote = await res.json();
    setState(sanitizeState(remote ? JSON.parse(JSON.stringify(remote)) : JSON.parse(JSON.stringify(SEED_STATE))));
    if (pendingRemovals.size > 0) {
      state.players = state.players.filter(p => !pendingRemovals.has(p.id));
      pendingRemovals.forEach(id => { delete state.predictions[id]; });
      if (Array.isArray(state.officialPlayers)) {
        state.officialPlayers = state.officialPlayers.filter(id => !pendingRemovals.has(id));
      }
    }
    if (!state.players.length) setState(JSON.parse(JSON.stringify(SEED_STATE)));
    if (state.players.length && !state.players.find(p => p.id === activePlayer)) {
      setActivePlayer(state.players[0].id);
    }
    setOnline(true);
    setDot("Synced", false);
    render();
  } catch (e) {
    setOnline(false);
    setDot("Offline", false);
  }
}

export function queueSave() {
  if (!dbUrl) { setDot("Local only", false); render(); return; }
  clearTimeout(saveTimer);
  setDot("Saving…", true);
  setSaveTimer(setTimeout(async () => {
    const payload = JSON.parse(JSON.stringify(state));
    try {
      const put = await fetch(dbUrl + POOL_PATH, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      if (!put.ok) {
        const hint = put.status === 401 || put.status === 403
          ? " — Firebase rules expired. Go to Firebase Console → Realtime Database → Rules, set .read and .write to true, then Publish."
          : " HTTP " + put.status;
        throw new Error(hint);
      }
      setOnline(true);
      pendingRemovals.clear();
      setSaveTimer(null);
      setDot("Saved ✓", true);
      setTimeout(() => setDot("Synced", false), 1200);
      render();
    } catch (e) {
      setOnline(false);
      setDot("Save failed" + (e.message || ""), false);
      console.warn("[PAB] Save error:", e);
      setTimeout(queueSave, 8000);
    }
  }, 700));
}
