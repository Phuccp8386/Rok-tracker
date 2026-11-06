#!/usr/bin/env python3
"""
Generate the demo dataset shipped in ``public/data``.

The dashboard ships with a small synthetic scan so a fresh clone renders a
working site immediately, before any real tracker output exists.

Usage:
    python tools/make_sample.py
"""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from normalize import read_csv, rebuild_index, write_scan  # noqa: E402

ALLIANCES = ["TITAN", "VIKING", "PHOENIX", "ORION", "NEMESIS"]
NAMES = [
    "Aurelius", "Zenobia", "Magnus", "Artemis", "Leonidas", "Cleopatra",
    "Solomon", "Darius", "Minerva", "Sun Tzu", "Alexander", "Hannibal",
    "Boudica", "Saladin", "Roxanne", "Mulan", "Yue Fei", "Vercingetorix",
    "Rameses", "Genghis Khan", "Siti", "Chandragupta", "Baldwin", "Jeanne d'Arc",
]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    sample_csv = root / "samples" / "sample-kingdom.csv"
    output_dir = root / "public" / "data"

    governors = read_csv(sample_csv)
    if not governors:
        print("Could not read the sample CSV.", file=sys.stderr)
        return 1

    random.seed(7)
    base = datetime(2026, 1, 15, 8, 0, tzinfo=timezone.utc)

    # Two scans: an older one and a newer one with slightly different numbers,
    # so the dashboard has something to show.
    for offset_days, label, rows in (
        (7, "KVK4 pass 1", governors),
        (0, "KVK4 pass 4", governors),
    ):
        stamped = []
        for g in rows:
            copy = dict(g)
            # Nudge the numbers so the two scans differ.
            drift = 1.0 + (offset_days == 0 and random.random() * 0.08 or 0)
            copy["power"] = int(copy["power"] * drift)
            copy["killPoints"] = int(copy["killPoints"] * drift)
            copy["rssGathered"] = int(copy["rssGathered"] * drift)
            stamped.append(copy)

        stamp = (base - __import__("datetime").timedelta(days=offset_days)).isoformat()
        entry = write_scan(
            output_dir,
            stamped,
            label=label,
            scope="kingdom",
            kingdom="3518",
            alliance=None,
            scanned_at=stamp,
        )
        print(f"  + {entry['file']} ({entry['count']} governors)")

    count = rebuild_index(output_dir)
    print(f"Index lists {count} sample scan(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
