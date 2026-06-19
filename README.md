# Points Are Bad — World Cup 2026

A lightweight family prediction pool for the 2026 World Cup. Pick exact scorelines for 15 group-stage matches. Lowest total points wins (perfect prediction = 0 points).

## How scoring works

```
Points = |your home score − actual home| + |your away score − actual away|
```

A correct prediction scores 0. A match only counts toward the leaderboard if every player submitted a prediction before kickoff — so late joiners don't skew the totals.

## Features

- Shared live leaderboard synced via Firebase Realtime Database
- Predictions lock automatically at each match's kickoff time (ET)
- Scores auto-fetch from the ESPN public API every 3 minutes
- Official Board vs Full Rankings (admin can control who's on the board)
- Admin controls: lock all predictions, manage official board members
- Works on mobile

## Running locally

No build step required. Because the app uses ES modules, it must be served over HTTP (not opened directly as a file):

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

## Firebase setup (pool owner only)

The pool syncs through a free Firebase Realtime Database. You only need to do this once:

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project
2. Add a **Realtime Database** (choose any region, start in **test mode**)
3. Copy the database URL — it looks like `https://your-project-default-rtdb.firebaseio.com`
4. Open the app, paste the URL into the setup box, and click **Connect**
5. Share the URL in your browser's address bar with your group — no accounts needed for anyone else

> **Note:** Test mode rules expire after 30 days. If saves start failing, go to Firebase Console → Realtime Database → Rules, set both `.read` and `.write` to `true`, and publish.

## Project structure

```
points-are-bad/
├── index.html        # HTML shell + SVG header animation
├── css/
│   └── main.css      # All styles
└── js/
    ├── data.js       # Match fixtures, team flags, seed state
    ├── state.js      # Shared app state + sanitize / merge logic
    ├── sync.js       # Firebase sync (connect, pull, save)
    ├── scoring.js    # Points calculation and leaderboard logic
    ├── fetch.js      # ESPN API auto-score fetching
    ├── render.js     # All view rendering functions
    ├── events.js     # DOM event listeners
    └── main.js       # App boot
```

## Deploying

Any static host works — the app is plain HTML/CSS/JS with no build step:

- **GitHub Pages:** push to `main`, enable Pages in repo settings (serve from root)
- **Netlify / Vercel:** drag and drop the folder or connect the repo
