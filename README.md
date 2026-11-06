# RoK Tracker

Open-source Rise of Kingdoms stats dashboard. Static site, deployable to
GitHub Pages, that visualises kingdom / alliance / honor leaderboard scans.

This repository contains two halves:

| Half | What it is | Where it runs |
|---|---|---|
| **Data** | A scanner that drives the game and produces raw stats | A machine that stays on 24/7 (Windows box, VPS, or a headless Android container) |
| **Web** | A React dashboard that renders the scans | GitHub Pages, free, static |

The two are decoupled on purpose: the dashboard is a pure static build that
reads JSON from `public/data`, so refreshing data never requires a rebuild of
the site logic and the site itself can be hosted anywhere.

---

## Architecture

```
┌──────────────────────────────┐        ┌───────────────────────────────┐
│  TIER 1 · DATA               │        │  TIER 2 · WEB (GitHub Pages)  │
│                              │        │                               │
│  Rise of Kingdoms client     │        │  React + Vite → static build  │
│        ↓ (ADB / Frida)       │        │        ↓                      │
│  scanner (OCR or injection)  │  push  │  public/data/*.json          │
│        ↓                     │ ─────► │        ↓ fetch at runtime     │
│  tools/normalize.py          │  JSON  │  dashboard tables / charts    │
└──────────────────────────────┘        └───────────────────────────────┘
        needs a live game client              needs nothing
```

**Important:** the game exposes no public API for lifetime statistics
(lifetime kill points, T1–T5 kill breakdown, deaths). Tier 1 therefore
*must* run a real game client somewhere. What GitHub Pages gives you is a
dashboard that is always online; the scanning worker is a separate,
self-hosted process.

---

## Quick start

### 1. Run the dashboard locally

```bash
npm install
npm run dev
```

The repository ships with a small synthetic dataset in `public/data`, so the
site renders immediately with sample data.

### 2. Regenerate the sample data

```bash
python tools/make_sample.py
```

### 3. Import real scan data

`tools/normalize.py` reads the output of any of the community Rise of
Kingdoms trackers and converts it into the dashboard's schema. It accepts
`.csv`, `.xlsx` and `.jsonl`, and matches columns by name, so most tracker
exports work without editing.

```bash
python tools/normalize.py \
  --input  "C:/RokTracker/scans/KVK4-pass4" \
  --output public/data \
  --label  "KVK4 pass 4" \
  --scope  kingdom \
  --kingdom 3518
```

Then rebuild and push:

```bash
npm run build
git add public/data
git commit -m "data: KVK4 pass 4 scan"
git push
```

The GitHub Action rebuilds and redeploys automatically on every push to
`main`, and also on a 6-hour schedule.

---

## Tier 1 · Getting the data

Pick the scanner that matches your setup. All of these produce a file the
normaliser can read.

| Scanner | Method | Host | Notes |
|---|---|---|---|
| [Cyrexxis/RokTracker](https://github.com/Cyrexxis/RokTracker) | OCR + ADB | Windows | Kingdom/alliance/honor, kill validation, XLSX/CSV/JSONL |
| [Nexor256/RoK-Tracker](https://github.com/Nexor256/RoK-Tracker) | OCR + ADB | Windows | Modern Tauri GUI, City Hall verification |
| [nikolakis1919/RokTracker](https://github.com/nikolakis1919/RokTracker) | OCR + ADB | Windows | The original, top 50–975, `.xls` |
| [mohd1024/RoKStat](https://github.com/mohd1024/RoKStat) | OCR + ADB | Windows / Linux | Also supports the PC client (`-d pc`) |
| [Rok-stats-titlebot](https://github.com/WoWHellgarve-HolyDeeW/Rok-stats-titlebot) | Frida injection | Windows | No OCR, exact data; includes `docs/` protocol research |
| [feels-dev/RokVision](https://github.com/feels-dev/RokVision) | PaddleOCR API | Docker | Resolution-independent OCR service, drops into the pipeline |

### Running headless on a server

Two viable paths, depending on whether you can give the machine a GPU:

**A. Headless Android (Redroid) + OCR** — fully containerised, Linux only.

```bash
docker run -d --name redroid --privileged --restart unless-stopped \
  -v ~/redroid/data:/data \
  -p 5555:5555 \
  redroid/redroid:12.0.0_64only-latest \
  androidboot.redroid_width=1920 \
  androidboot.redroid_height=1080 \
  androidboot.redroid_dpi=320 \
  androidboot.redroid_gpu_mode=host
```

`gpu_mode=host` needs `/dev/dri/renderD128` exposed; `gpu_mode=guest` is
software rendering and usually too slow for a Unity game.

**B. PC client + Lua injection** — no emulator, no OCR, exact numbers, but
requires a Windows host and reverse-engineering work. The research notes in
the `Rok-stats-titlebot` repository (`docs/whmp-protocol-solution.md`,
`docs/title-injection.md`) cover the approach.

### Automating the push

Run the scanner on a schedule and push the normalised output straight into
this repository:

```bash
0 */6 * * * /opt/rok/scan-and-push.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/rok
python /opt/rok/scanner/rok-scanner.py --tag "$(date -u +%FT%TZ)" --number 300 -d adb
python /opt/rok/normalize.py \
  --input "C:/RokTracker/scans/$(date -u +%FT%TZ)" \
  --output /opt/rok/site/public/data \
  --label "auto $(date -u +%FT%TZ)" --scope kingdom --kingdom 3518
cd /opt/rok/site
git add public/data && git commit -m "data: auto scan $(date -u +%FT%TZ)" && git push
```

The scheduled GitHub Action then picks the new files up and redeploys.

---

## Tier 2 · Deploying to GitHub Pages

1. Create the repository on GitHub and push this code to `main`.
2. **Settings → Pages → Source → GitHub Actions**.
3. Set the repository variable `VITE_BASE_PATH`:
   - project site (`https://<user>.github.io/<repo>/`) → `/<repo>/`
   - user site (`https://<user>.github.io/`) → leave empty
4. Push, and the `deploy.yml` workflow publishes the site.

The workflow uses `actions/configure-pages`, so no `gh-pages` branch is
needed.

---

## Data schema

`public/data/index.json` lists every scan:

```json
[
  {
    "scannedAt": "2026-01-15T08:00:00+00:00",
    "label": "KVK4 pass 4",
    "scope": "kingdom",
    "kingdom": "3518",
    "count": 14,
    "file": "data/scans/2026-01-15T08-00-00-00-00-kvk4-pass-4.json"
  }
]
```

Each scan file holds the governors:

```json
{
  "scannedAt": "2026-01-15T08:00:00+00:00",
  "label": "KVK4 pass 4",
  "scope": "kingdom",
  "kingdom": "3518",
  "governors": [
    {
      "id": "100001",
      "name": "Aurelius",
      "alliance": "TITAN",
      "power": 142500000,
      "killPoints": 18420000,
      "rangedPoints": 0,
      "kills": { "t1": 1200000, "t2": 980000, "t3": 760000, "t4": 540000, "t5": 320000 },
      "totalKills": 3800000,
      "highTierKills": 860000,
      "deadTroops": 1200000,
      "rssGathered": 890000000,
      "rssAssistance": 420000000,
      "helps": 1840,
      "rank": 1,
      "inactive": false
    }
  ]
}
```

---

## DKP scoring

`src/lib/metrics.ts` computes a DKP (Dominion Kill Points) score from the raw
stats. Weights are configurable and default to:

```ts
{
  killPoints: 1,
  highTierKills: 50,
  rssGathered: 0.5,
  rssAssistance: 0.25,
  helps: 5,
  deadTroops: -0.1,
}
```

Every alliance runs its own scoring policy, so adjust `DEFAULT_DKP_WEIGHTS`
to match yours.

Rows whose kill-point-to-kill ratio looks like an OCR misread are flagged
in red rather than silently trusted.

---

## Project layout

```
src/
  App.tsx                 main shell, state, filtering
  components/
    GovernorTable.tsx     sortable leaderboard table
    AllianceBreakdown.tsx per-alliance aggregate cards
    SummaryCards.tsx      headline numbers
    ScanPicker.tsx        scan selector
  lib/
    data.ts               runtime JSON loading, base-path aware
    metrics.ts            DKP scoring, sorting, aggregation
  types.ts                shared data model

tools/
  normalize.py            tracker output → dashboard JSON
  make_sample.py          regenerate the synthetic demo dataset

public/data/
  index.json              scan manifest
  scans/*.json            one file per scan

.github/workflows/deploy.yml   build + deploy to GitHub Pages
```

---

## Disclaimer

This project is not affiliated with or endorsed by Lilith Games. Automating
game clients may violate the game's terms of service and can result in an
account being banned. Use a throwaway account if you automate anything, and
you are responsible for your own usage.
