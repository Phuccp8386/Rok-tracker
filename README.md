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

## Choosing which kingdom to scan

This depends entirely on the scanner, not on the dashboard.

| Tier 1 method | Can you pick any kingdom? |
|---|---|
| **OCR scanners** (Cyrexxis, nikolakis1919, Nexor256) | **No.** The kingdom is decided by whichever character is logged in. To scan another kingdom you need an account in it — usually a farm/alt account. There is no `--kingdom` switch. |
| **PC client + Lua injection / WHMP protocol** | **Yes.** `FetchPlayerInfo(nil, id, 2)` fetches any governor by id, so any kingdom can be harvested. This is how the [rok-data-pipeline](https://www.ndang.dev/work/rok-pipeline) project sweeps 4,000 kingdoms. |

The `--kingdom` flag on `normalize.py` is **metadata only** — it labels the
scan so the dashboard can group and filter by kingdom. It does not steer the
scanner.

### Multi-kingdom dashboards

Scans from different kingdoms coexist in `public/data`. The dashboard has a
**Kingdom** selector:

- **All kingdoms** — merges the newest scan of every kingdom into one view
  and adds a `KD` column so rows stay attributable.
- **A specific kingdom** — shows only that kingdom's newest scan.

Only the newest scan per kingdom is merged; older scans of the same kingdom
stay reachable through the **Scan** picker.

To label a scan for a kingdom:

```bash
python tools/normalize.py \
  --input "C:/RokTracker/scans/kd2455" \
  --output public/data \
  --label "KVK3 pass 5" \
  --scope kingdom \
  --kingdom 2455
```

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
# Refuse to publish data that does not reconcile with the game's arithmetic.
python tools/validate.py public/data --strict

git add public/data && git commit -m "data: auto scan $(date -u +%FT%TZ)" && git push
```

`--strict` makes the script exit non-zero if any row is suspect, so a bad
scan never reaches the published site. The scheduled GitHub Action then picks
the new files up and redeploys.

---

## Tier 2 · Deploying to GitHub Pages

The repository is already wired for GitHub Pages. One manual step remains.

1. **Settings → Pages → Source → GitHub Actions**
   - In the repository: `Settings` → `Pages` → `Build and deployment` →
     `Source` → pick **GitHub Actions**.

2. Push to `main`. The `deploy.yml` workflow builds and publishes the site.

The workflow resolves the base path on its own:

| Site type | Base path |
|---|---|
| Project site — `https://<user>.github.io/<repo>/` | `/<repo>/` |
| User site — `https://<user>.github.io/` | root |

It derives this from the repository name, so there is nothing to configure
for a standard project site. If you later serve from a custom domain, set the
`VITE_BASE_PATH` repository variable (Settings → Secrets and variables →
Actions → Variables) to override it.

The site will be live at:

```
https://Phuccp8386.github.io/Rok-tracker/
```

### Workflows

| Workflow | When | What it does |
|---|---|---|
| `deploy.yml` | push to `main`, every 6 hours, manual | builds the site and publishes to Pages |
| `validate-data.yml` | push touching `public/data/` or `tools/` | validates every scan against the game's kill point formula and fails the build on bad data |

`validate-data.yml` runs before `deploy.yml` publishes, so a scan that does
not reconcile with the game's arithmetic never reaches the live site.

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

## Data integrity

The scanner reads the screen with OCR, so numbers can be misread. Every row
is cross-checked against the game's **own arithmetic** before it is trusted.

### The kill point formula

Kill points in Rise of Kingdoms are computed by the game from the tier
breakdown, using these published per-tier values:

| Tier | Points per kill |
|---|---|
| T1 | 0.2 |
| T2 | 2 |
| T3 | 4 |
| T4 | 10 |
| T5 | 20 |

So for any governor:

```
killPoints == t1*0.2 + t2*2 + t3*4 + t4*10 + t5*20
```

**Ranged points are excluded** — the game calculates them separately from
kill points (added in update 1.0.64), so they are not part of this sum.

This formula is the backbone of the validation. A row whose reported kill
points do not reconcile with its tier breakdown cannot be correct: one of the
two numbers was misread. The scanner itself does the same check and drops
failing screenshots into `manual_review/`.

### What gets checked

| Check | Failure meaning |
|---|---|
| Kill points vs tier breakdown | OCR misread one of the two sides |
| Total kills vs tier sum | Inconsistent row |
| Kill points within 0.2–20 per kill | Physically impossible |
| Ranged points vs kill points | Misread digit |
| Power, deaths, RSS, helps in range | Misread digit |

Severity is `warn` above 5% deviation and `error` above 20%.

### Where it runs

**In the dashboard** — a Data quality panel shows how many rows verified, and
flags rows in the table with a `warn`/`error` badge. Hovering a row lists the
exact problem.

**In the pipeline** — `tools/validate.py` applies the identical rules before
data is published:

```bash
python tools/validate.py public/data
python tools/validate.py public/data --strict   # fail on any warning
```

**In CI** — `.github/workflows/validate-data.yml` runs the validator on every
push that touches `public/data/` or `tools/`, so a bad scan cannot silently
reach the published site.

### The demo data is not arbitrary

`tools/make_sample.py` builds each row *from* the kill point formula rather
than picking random numbers and hoping. The demo dataset therefore passes
the same validation as real data — 56/56 rows verified. A demo that could
not pass its own validator would be worthless.

---

## DKP scoring

`src/lib/metrics.ts` computes a DKP (Dominion Kill Points) score from the raw
stats. The defaults follow the community's standard KvK contribution formula:

```ts
{
  killPoints: 0.001,      // the game's own measure, scaled down
  highTierKills: 1,       // T4 = 1, T5 = 2 combined into the tier weight
  rssGathered: 1 / 10_000,
  rssAssistance: 0,
  helps: 0,
  deadTroops: 10,         // you did fight, even if you lost
}
```

Every alliance runs its own scoring policy, so adjust `DEFAULT_DKP_WEIGHTS`
in `src/lib/metrics.ts` to match yours.

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
    KingdomFilter.tsx     kingdom selector / multi-kingdom merge
    DataQuality.tsx       validation panel
  lib/
    data.ts               runtime JSON loading, base-path aware
    metrics.ts            DKP scoring, sorting, aggregation
    validation.ts         kill point reconciliation, range checks
    game-constants.ts     verified game constants (loader)
    game-constants.json   verified game constants (source of truth)
  types.ts                shared data model

tools/
  normalize.py            tracker output → dashboard JSON
  make_sample.py          generate the synthetic demo dataset
  validate.py             validate scans against the game's arithmetic

public/data/
  index.json              scan manifest
  scans/*.json            one file per scan

.github/workflows/
  deploy.yml              build + deploy to GitHub Pages
  validate-data.yml       data integrity gate
```

---

## Disclaimer

This project is not affiliated with or endorsed by Lilith Games. Automating
game clients may violate the game's terms of service and can result in an
account being banned. Use a throwaway account if you automate anything, and
you are responsible for your own usage.
