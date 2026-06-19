import { MATCHES, FLAGS } from "./data.js";
import {
  state, tab, activePlayer, editingPred, editingRes, boardView, adminPanelOpen,
  dbUrl, setAdminPanelOpen
} from "./state.js";
import {
  matchPoints, hasFullPred, hasFullEntries, getOfficialIds,
  playedMatches, isCounted, countedMatches, leaderboard, isLocked, num
} from "./scoring.js";
// liveSet is imported lazily inside viewRes to avoid circular dependency with fetch.js
// (fetch.js imports render, render.js would import fetch → circular)

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function render() {
  document.querySelector("#playedSub").textContent =
    "Lowest total wins · " + countedMatches().length + " of " + playedMatches().length + " played matches counted";
  renderBanner();
  renderTabs();
  const v = document.querySelector("#view");
  if (tab === "board")      v.innerHTML = viewBoard();
  else if (tab === "pred")  v.innerHTML = viewPred();
  else if (tab === "res")   v.innerHTML = viewRes();
  else                      v.innerHTML = viewRules();
}

export function renderBanner() {
  const b = document.querySelector("#poolBanner");
  if (dbUrl) {
    const link = location.origin + location.pathname + "#db=" + encodeURIComponent(dbUrl);
    const locked = !!state.predictionsLocked;
    const officialIds = getOfficialIds();
    b.innerHTML =
      '<div class="note">Pool live — share this link with the family:' +
      '<div class="linkbox"><input readonly id="shareLink" value="' + esc(link) + '"><button class="gold" id="copyBtn">Copy link</button>' +
      '<button class="syncbtn" id="testFetch">⚡ Fetch scores</button></div></div>' +
      '<details class="adminpanel"' + (adminPanelOpen ? " open" : "") + '><summary>Admin controls</summary>' +
      '<div class="adminrow"><button class="lockbtn' + (locked ? " unlock" : "") + '" id="lockAllBtn">' +
      (locked ? "🔓 Unlock Predictions" : "🔒 Lock All Predictions") + "</button>" +
      '<span style="font-size:12px;color:#9DBFAF">' + (locked ? "All editing is frozen." : "Freeze all predictions for everyone immediately.") + "</span></div>" +
      '<div style="margin-top:12px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9DBFAF">Official Board Players</div>' +
      '<div style="font-size:12px;color:#8FB3A2;margin-top:3px">Checked players appear on the Official Board. Unchecked show only in Full Rankings.</div>' +
      '<div class="adminrow"><button class="syncbtn" id="autoOfficialBtn">Auto: full entries only</button><button class="syncbtn" id="allOfficialBtn">Select all</button><button class="syncbtn" id="noneOfficialBtn">Clear all</button></div>' +
      '<div class="checkgrid">' +
      state.players.map(p =>
        '<label class="plcheck"><input type="checkbox" data-offpid="' + p.id + '"' + (officialIds.includes(p.id) ? " checked" : "") + ">" +
        esc(p.name) + (hasFullEntries(p.id) ? ' <span class="offtag">Full</span>' : "") + "</label>"
      ).join("") + "</div></details>";
    const det = b.querySelector(".adminpanel");
    if (det) det.addEventListener("toggle", () => { setAdminPanelOpen(det.open); });
  } else {
    b.innerHTML =
      '<div class="note warn"><b>One-time setup (pool owner only):</b> paste your Firebase database URL below and connect. ' +
      "It looks like <i>https://something-default-rtdb.firebaseio.com</i>. After connecting you’ll get a family share link — no accounts needed for anyone else." +
      '<div class="linkbox"><input id="dbInput" placeholder="https://your-project-default-rtdb.firebaseio.com"><button class="gold" id="connectBtn">Connect</button></div></div>';
  }
}

export function renderTabs() {
  document.querySelector("#tabs").innerHTML = [["board","Leaderboard"],["pred","Predictions"],["res","Results"],["rules","Rules"]]
    .map(([k, l]) => '<button class="tab' + (tab === k ? " on" : "") + '" data-tab="' + k + '">' + l + "</button>").join("");
}

function buildRows(playerIds) {
  const counted = countedMatches();
  const played  = playedMatches();
  const rows = state.players.filter(p => playerIds.includes(p.id)).map(p => {
    let total = 0, perfects = 0;
    counted.forEach(m => {
      const pts = matchPoints(p.id, m.n); total += pts;
      if (pts === 0 && hasFullPred(p.id, m.n)) perfects++;
    });
    return Object.assign({}, p, { total, perfects, counted: counted.length, played: played.length });
  });
  rows.sort((a, b) => a.total - b.total || b.perfects - a.perfects || a.name.localeCompare(b.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (prev === null || r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = rank; });
  return rows;
}

function renderRows(rows, countedCount, highlightFirst) {
  return rows.map(r =>
    '<div class="boardrow' + (r.rank === 1 && highlightFirst && countedCount > 0 ? " lead" : "") + '">' +
      '<div class="rank">' + r.rank + "</div>" +
      '<div><div class="pname">' + esc(r.name) + '</div><div class="pmeta">' +
        r.counted + " match" + (r.counted === 1 ? "" : "es") + " counted \xB7 " + r.perfects + " perfect" + (r.perfects === 1 ? "" : "s") +
      "</div></div>" +
      '<div><div class="pts">' + r.total + '</div><div class="ptslabel">pts</div></div>' +
    "</div>"
  ).join("");
}

export function viewBoard() {
  if (!state.players.length) {
    return '<div class="note">No players yet — head to the <b>Predictions</b> tab and add your group first.</div>';
  }
  try {
    const officialIds    = getOfficialIds();
    const allIds         = state.players.map(p => p.id);
    const showingOfficial = boardView === "official";
    const activeIds      = showingOfficial ? officialIds : allIds;
    const rows           = buildRows(activeIds);
    const { playedCount, countedCount } = leaderboard();

    let html = '<div class="boardtabs">' +
      '<button class="btab' + (showingOfficial ? " on" : "") + '" id="btabOfficial">🏆 Official Board</button>' +
      '<button class="btab' + (!showingOfficial ? " on" : "") + '" id="btabAll">📋 Full Rankings</button></div>';

    if (playedCount === 0) {
      html += '<div class="note">No results yet. Scores will appear once results come in.</div>';
    } else if (countedCount < playedCount) {
      html += '<div class="note">' + (playedCount - countedCount) + " match" +
        (playedCount - countedCount === 1 ? " is" : "es are") +
        " excluded (not everyone predicted) — totals only count shared matches.</div>";
    }

    if (showingOfficial && officialIds.length === 0) {
      html += '<div class="note warn">No players on the Official Board yet. Open Admin Controls above to select participants, or click “Auto: full entries only.”</div>';
    } else {
      html += renderRows(rows, countedCount, true);
    }

    if (playedCount > 0) {
      html += '<div class="breakwrap"><table class="break"><thead><tr><th style="text-align:left">Match</th><th>Score</th>' +
        state.players.filter(p => activeIds.includes(p.id)).map(p => "<th>" + esc(p.name) + "</th>").join("") +
        "</tr></thead><tbody>" +
        playedMatches().map(m => {
          const r = state.results[m.n];
          const counted = isCounted(m);
          const activePlayers = state.players.filter(p => activeIds.includes(p.id));
          return "<tr" + (counted ? "" : ' class="exclrow"') + '><td class="match">' +
            FLAGS[m.home] + " " + esc(m.home) + " v " + esc(m.away) + " " + FLAGS[m.away] +
            (counted ? "" : ' <span class="excltag">not counted</span>') + "</td><td>" + r.h + "–" + r.a + "</td>" +
            activePlayers.map(p => {
              const made = hasFullPred(p.id, m.n);
              const pts  = matchPoints(p.id, m.n);
              return '<td class="' + (made && pts === 0 && counted ? "zero" : (!made ? "none" : "")) + '">' + (made ? pts : "—") + "</td>";
            }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
    return html;
  } catch (e) {
    console.error("[PAB] viewBoard error:", e);
    return '<div class="note warn">Board error: ' + esc(String(e)) + " — check the console (F12).</div>";
  }
}

export function viewPred() {
  if (!state.players.length) {
    return '<div class="note">No players yet. Use the <b>+ Add player</b> button below to add everyone in your group, then fill in their predictions before each match kicks off.</div>' +
      '<div class="chips"><button class="chip add" id="addPlayer">+ Add player</button></div>';
  }
  const active     = state.players.find(p => p.id === activePlayer) || state.players[0];
  const globalLock = !!state.predictionsLocked;
  let html = '<h2 class="sec">Whose card?</h2><div class="chips">' +
    state.players.map(p => '<button class="chip' + (p.id === active.id ? " on" : "") + '" data-player="' + p.id + '">' + esc(p.name) + "</button>").join("") +
    '<button class="chip add" id="addPlayer">+ Add player</button></div>';
  if (globalLock) {
    html += '<div class="lockbanner">🔒 Predictions are locked by the pool admin — all cards are frozen.</div>';
  } else {
    html += '<div class="pedit">' +
      (editingPred
        ? '<button class="gold" id="togglePredEdit">✓ Done — save ' + esc(active.name) + "’s card</button>" +
          '<input id="renameInput" maxlength="20" value="' + esc(active.name) + '" aria-label="Player name">' +
          (state.players.length > 1 ? '<button class="danger" id="removePlayer">Remove player</button>' : "")
        : '<button class="syncbtn" id="togglePredEdit">✏️ Edit ' + esc(active.name) + "’s predictions</button>") +
      "</div>";
    html += editingPred
      ? '<div class="note">Editing <b>' + esc(active.name) + "</b>. Press <b>Done</b> when finished.</div>"
      : '<div class="note">Cards are read-only to prevent accidental changes. Press <b>Edit</b> to fill in or change ' + esc(active.name) + "’s predictions. Locks at kickoff (ET) regardless.</div>";
  }
  html += MATCHES.map(m => {
    const locked   = isLocked(m) || globalLock;
    const disabled = locked || !editingPred;
    const pred     = (state.predictions[active.id] || {})[m.n] || {h: null, a: null};
    const pts      = matchPoints(active.id, m.n);
    return '<div class="mcard"><div class="mtop"><span>' + m.date + " \xB7 " + m.time + " ET \xB7 Group " + m.group + " \xB7 " + esc(m.venue) + "</span>" +
      (locked ? '<span class="lockbadge">🔒 Locked</span>' : '<span class="openbadge">Open</span>') + "</div>" +
      '<div class="teams"><div class="team">' + FLAGS[m.home] + " " + esc(m.home) + "</div>" +
      '<div class="scorebox">' +
      '<input type="number" min="0" max="20" inputmode="numeric" value="' + (num(pred.h) === null ? "" : pred.h) + '"' + (disabled ? " disabled" : "") + ' data-pred="' + m.n + ':h" aria-label="' + esc(m.home) + ' prediction">' +
      '<span class="dash">–</span>' +
      '<input type="number" min="0" max="20" inputmode="numeric" value="' + (num(pred.a) === null ? "" : pred.a) + '"' + (disabled ? " disabled" : "") + ' data-pred="' + m.n + ':a" aria-label="' + esc(m.away) + ' prediction">' +
      '</div><div class="team away">' + esc(m.away) + " " + FLAGS[m.away] + "</div></div>" +
      (pts !== null
        ? '<div class="ptschip">Final ' + state.results[m.n].h + "–" + state.results[m.n].a +
          " → <b>" + pts + " pt" + (pts === 1 ? "" : "s") + "</b>" +
          (pts === 0 ? " \xB7 perfect! 🎯" : "") +
          (isCounted(m) ? "" : ' \xB7 <span style="color:#E2A33D">not counted — not everyone predicted</span>') + "</div>"
        : "") +
      "</div>";
  }).join("");
  return html;
}

export function viewRes() {
  // dynamic import to break the fetch.js ↔ render.js circular reference
  const { liveSet } = window.__pab_fetch__ || { liveSet: new Set() };
  return '<h2 class="sec">Final scores</h2>' +
    '<div class="pedit">' +
    (editingRes
      ? '<button class="gold" id="toggleResEdit">✓ Done — save results</button>'
      : '<button class="syncbtn" id="toggleResEdit">✏️ Edit / override</button>') +
    "</div>" +
    (editingRes
      ? '<div class="note">Editing scores manually. Press <b>Done</b> when finished.</div>'
      : '<div class="note">⚡ Scores auto-fetch every 3 min. Hit <b>Fetch scores</b> at the top for an instant check. Use <b>Edit / override</b> to correct anything manually.</div>') +
    MATCHES.map(m => {
      const r       = state.results[m.n] || {h: null, a: null};
      const started = isLocked(m);
      const disabled = !editingRes;
      const isLive  = liveSet.has(m.n);
      const isAuto  = !!(r && r.auto && num(r.h) !== null);
      return '<div class="mcard"><div class="mtop"><span>' + m.code + " \xB7 " + m.date + " \xB7 " + m.time + " ET \xB7 " + esc(m.venue) + "</span>" +
        (isLive ? '<span class="livebadge">🔴 Live</span>'
          : (!started ? '<span class="openbadge">Not started</span>'
          : (isAuto ? '<span class="autobadge">⚡ Auto</span>' : ""))) + "</div>" +
        '<div class="teams"><div class="team">' + FLAGS[m.home] + " " + esc(m.home) + "</div>" +
        '<div class="scorebox">' +
        '<input type="number" min="0" max="20" inputmode="numeric" value="' + (num(r.h) === null ? "" : r.h) + '"' + (disabled ? " disabled" : "") + ' data-res="' + m.n + ':h" aria-label="' + esc(m.home) + ' final score">' +
        '<span class="dash">–</span>' +
        '<input type="number" min="0" max="20" inputmode="numeric" value="' + (num(r.a) === null ? "" : r.a) + '"' + (disabled ? " disabled" : "") + ' data-res="' + m.n + ':a" aria-label="' + esc(m.away) + ' final score">' +
        '</div><div class="team away">' + esc(m.away) + " " + FLAGS[m.away] + "</div></div></div>";
    }).join("");
}

export function viewRules() {
  return '<section class="rules"><h2 class="sec">How it works</h2>' +
    "<p>Before each of the 15 selected group-stage matches, predict the exact final scoreline. After full time, your damage is:</p>" +
    '<div class="formula">Points = |your home − actual home| + |your away − actual away|</div>' +
    "<p>A perfect prediction scores 0. The further off you are, the more it hurts. The player with the <b>fewest</b> total points after match 15 lifts the trophy. 🏆</p>" +
    "<p><b>Example:</b> You predict Brazil 2–1 Morocco. It finishes 1–1. That’s |2−1| + |1−1| = <b>1 point</b>.</p>" +
    "<p><b>House rules:</b> predictions lock at kickoff (no edits once the match starts — the app enforces this). Regular-time scores only. A match only counts toward the leaderboard if <b>every</b> player had a complete prediction in before it was played — so late joiners don’t skew the totals. Skipped matches show greyed out in the breakdown.</p>" +
    '<p style="color:#9DBFAF;font-size:13px">Everyone with this pool’s link shares the same live board. Anyone with the link can edit, so keep it in the family — and don’t put anything private in player names.</p></section>';
}
