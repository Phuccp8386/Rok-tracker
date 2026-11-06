#!/usr/bin/env python3
"""
Generate the demo dataset shipped in ``public/data``.

The dashboard ships with a small synthetic dataset so a fresh clone renders a
working site immediately, before any real tracker output exists.

Two kingdoms are generated so the multi-kingdom filter can be exercised.

The numbers are NOT random. Every row is built so that it satisfies the
game's own kill point formula:

    kill_points = t1*0.2 + t2*2 + t3*4 + t4*10 + t5*20

That means the demo data passes the same validation the dashboard applies to
real scanner output. A demo that could not pass its own validator would be
worse than useless.

Usage:
    python tools/make_sample.py
"""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from normalize import read_csv, rebuild_index, write_scan  # noqa: E402

# The published per-tier kill point values. Source: the game's own profile
# screen arithmetic, corroborated by the community attack guide.
KILL_POINTS_PER_KILL = {"t1": 0.2, "t2": 2, "t3": 4, "t4": 10, "t5": 20}

# (kingdom, labels)
KINGDOMS = [
    ("3518", ["KVK4 pass 1", "KVK4 pass 4"]),
    ("2455", ["KVK3 pass 2", "KVK3 pass 5"]),
]

ALLIANCES = ["TITAN", "VIKING", "PHOENIX", "ORION", "NEMESIS"]

NAMES = [
    "Aurelius", "Zenobia", "Magnus", "Artemis", "Leonidas", "Cleopatra",
    "Solomon", "Darius", "Minerva", "Sun Tzu", "Alexander", "Hannibal",
    "Boudica", "Saladin", "Roxanne", "Mulan", "Yue Fei", "Vercingetorix",
]


def build_kill_mix(rng: random.Random, total_kills: int) -> dict[str, int]:
    """
    Build a realistic tier mix that sums to total_kills.

    Real kill breakdowns are dominated by lower tiers with a meaningful
    high-tier component. We pick a high-tier share, then fill the remainder.
    """
    t5 = int(total_kills * rng.uniform(0.08, 0.18))
    t4 = int(total_kills * rng.uniform(0.15, 0.28))
    t3 = int(total_kills * rng.uniform(0.20, 0.30))
    t2 = int(total_kills * rng.uniform(0.15, 0.25))
    # Whatever is left over is T1, so the sum is exact.
    t1 = total_kills - t2 - t3 - t4 - t5
    if t1 < 0:
        t1 = 0
    return {"t1": t1, "t2": t2, "t3": t3, "t4": t4, "t5": t5}


def kill_points_for(mix: dict[str, int]) -> int:
    """The game's own formula, rounded the way the profile screen rounds."""
    raw = sum(mix[tier] * KILL_POINTS_PER_KILL[tier] for tier in mix)
    return int(round(raw))


def build_row(rng: random.Random, rank: int, index: int) -> dict:
    """Build one governor row that is internally consistent."""
    # Power scales down the leaderboard, from 145M down to ~35M.
    power = int(145_000_000 * (0.25 + 0.75 * (1 - index / 20)) * rng.uniform(0.94, 1.06))

    # Total kills scale roughly with power.
    total_kills = int(power / rng.uniform(42, 60))

    mix = build_kill_mix(rng, total_kills)
    kill_points = kill_points_for(mix)

    # Dead troops: a fraction of troops engaged.
    dead = int(total_kills * rng.uniform(0.25, 0.45))

    # Ranged points are separate from kill points. They only exist in
    # kingdoms with the formations feature unlocked, and are much smaller.
    ranged = int(kill_points * rng.uniform(0.02, 0.12))

    # Resources gathered correlate with power.
    rss_gathered = int(power * rng.uniform(5.0, 8.5))
    rss_assistance = int(rss_gathered * rng.uniform(0.3, 0.55))
    helps = int(rng.uniform(700, 2200))

    return {
        "id": str(100001 + index),
        "name": NAMES[index % len(NAMES)],
        "alliance": ALLIANCES[index % len(ALLIANCES)],
        "power": power,
        "killPoints": kill_points,
        "rangedPoints": ranged,
        "kills": mix,
        "totalKills": sum(mix.values()),
        "highTierKills": mix["t4"] + mix["t5"],
        "deadTroops": dead,
        "rssGathered": rss_gathered,
        "rssAssistance": rss_assistance,
        "helps": helps,
        "rank": rank,
        "inactive": False,
    }


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    output_dir = root / "public" / "data"

    base = datetime(2026, 1, 15, 8, 0, tzinfo=timezone.utc)

    for kingdom, labels in KINGDOMS:
        for label in labels:
            rng = random.Random(f"{kingdom}-{label}")
            governors = [build_row(rng, rank, rank - 1) for rank in range(1, 15)]

            # Newest label gets the newest timestamp.
            offset = 0 if label == labels[-1] else 7
            stamp = (base - timedelta(days=offset)).isoformat()

            entry = write_scan(
                output_dir,
                governors,
                label=f"{kingdom} {label}",
                scope="kingdom",
                kingdom=kingdom,
                alliance=None,
                scanned_at=stamp,
            )
            print(f"  + {entry['file']} ({entry['count']} governors)")

    count = rebuild_index(output_dir)
    print(f"Index lists {count} sample scan(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
