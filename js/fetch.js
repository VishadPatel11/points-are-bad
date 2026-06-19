import { MATCHES } from "./data.js";
import { state, editingPred, editingRes } from "./state.js";
import { num } from "./scoring.js";
import { setDot, queueSave } from "./sync.js";
import { render } from "./render.js";

const TEAM_MAP = {
  "united states": "usa", "us": "usa",
  "c\xF4te d'ivoire": "ivory coast", "cote d'ivoire": "ivory coast", "cote divoire": "ivory coast",
  "turkey": "t\xFCrkiye", "turkiye": "t\xFCrkiye",
  "south korea": "korea republic", "republic of korea": "korea republic",
};
const normTeam = n => TEAM_MAP[(n || "").toLowerCase()] || (n || "").toLowerCase();

export let liveSet = new Set();
// Expose liveSet globally so render.js can read it without a circular import
window.__pab_fetch__ = { liveSet };

export async function autoFetchResults(fromButton) {
  const startedMatches = MATCHES.filter(m => Date.now() >= new Date(m.kickoff).getTime());
  if (!startedMatches.length) return;
  const dates = [...new Set(startedMatches.map(m => m.kickoff.slice(0, 10).replace(/-/g, "")))];
  try {
    const prevLive = new Set(liveSet);
    liveSet = new Set();
    window.__pab_fetch__.liveSet = liveSet;
    let updated = 0;
    for (const d of dates) {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${d}`);
      console.log("[PAB] ESPN", d, "HTTP", res.status);
      if (!res.ok) continue;
      const data = await res.json();
      const events = (data.events || []).filter(ev => { const yr = ev.season && ev.season.year; return yr === 2026 || yr === "2026"; });
      console.log("[PAB] ESPN", d, events.length, "events");
      events.forEach(ev => {
        const comp = (ev.competitions || [])[0]; if (!comp) return;
        const home = comp.competitors.find(c => c.homeAway === "home");
        const away = comp.competitors.find(c => c.homeAway === "away");
        if (!home || !away) return;
        const pool = MATCHES.find(m =>
          normTeam(m.home) === normTeam(home.team.displayName) &&
          normTeam(m.away) === normTeam(away.team.displayName)
        );
        if (!pool) return;
        const sn = ev.status && ev.status.type && ev.status.type.name;
        if (sn === "STATUS_IN_PROGRESS" || sn === "STATUS_HALFTIME") liveSet.add(pool.n);
        if (sn === "STATUS_FINAL" || sn === "STATUS_FULL_TIME") {
          const h = parseInt(home.score), a = parseInt(away.score);
          if (!isNaN(h) && !isNaN(a)) {
            const cur = state.results[pool.n];
            if (!cur || num(cur.h) !== h || num(cur.a) !== a) {
              state.results[pool.n] = {h, a, auto: true};
              updated++;
            }
          }
        }
      });
    }
    window.__pab_fetch__.liveSet = liveSet;
    const liveChanged = liveSet.size !== prevLive.size || [...liveSet].some(id => !prevLive.has(id));
    if (updated > 0) {
      setDot("↓ " + updated + " score" + (updated > 1 ? "s" : "") + " updated!", true);
      setTimeout(() => setDot("Synced", false), 2500);
      queueSave();
    } else if (fromButton) {
      setDot("Fetched — no new scores", false);
      setTimeout(() => setDot("Synced", false), 3000);
    }
    if (liveChanged && !editingPred && !editingRes) render();
  } catch (e) {
    console.warn("[PAB] ESPN fetch error:", e);
    if (fromButton) { setDot("Fetch failed — see console", false); setTimeout(() => setDot("Synced", false), 4000); }
  }
}
