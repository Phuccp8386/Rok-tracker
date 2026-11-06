#!/usr/bin/env python3
"""
Generate the demo dataset shipped in ``public/data``.

The dashboard ships with a small synthetic dataset so a fresh clone renders a
working site immediately, before any real tracker output exists.

Two kingdoms are generated so the multi-kingdom filter can be exercised.

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

# (kingdom, alliance tag suffix, sample file, labels)
KINGDOMS = [
    ("3518", "sample-kingdom.csv", ["KVK4 pass 1", "KVK4 pass 4"]),
    ("2455", "sample-kingdom.csv", ["KVK3 pass 2", "KVK3 pass 5"]),
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

    for kingdom, csv_name, labels in KINGDOMS:
        for label in labels:
            stamped = []
            for g in governors:
                copy = dict(g)
                # Nudge the numbers so each scan differs from the others.
                drift = 1.0 + random.random() * 0.08
                copy["power"] = int(copy["power"] * drift)
                copy["killPoints"] = int(copy["killPoints"] * drift)
                copy["rssGathered"] = int(copy["rssGathered"] * drift)
                stamped.append(copy)

            # Newest label gets the newest timestamp.
            offset = 0 if label == labels[-1] else 7
            stamp = (base - timedelta(days=offset)).isoformat()

            entry = write_scan(
                output_dir,
                stamped,
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
