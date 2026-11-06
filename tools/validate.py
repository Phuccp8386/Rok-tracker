#!/usr/bin/env python3
"""
Validate scan data against the game's own arithmetic.

This runs in the pipeline, before data is pushed to the published site. It
uses the same rules as the dashboard's TypeScript validator so a scan that
passes here also passes there.

The core check is the kill point reconciliation:

    kill_points == t1*0.2 + t2*2 + t3*4 + t4*10 + t5*20

Ranged points are excluded because the game calculates them separately.

Usage:
    python tools/validate.py public/data/scans/2026-01-15T08-00-00.json
    python tools/validate.py public/data --strict
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# The published per-tier kill point values.
KILL_POINTS_PER_KILL = {"t1": 0.2, "t2": 2, "t3": 4, "t4": 10, "t5": 20}
TIERS = ("t1", "t2", "t3", "t4", "t5")

TOLERANCE_WARN = 0.05
TOLERANCE_ERROR = 0.20

LIMITS = {
    "power": (0, 1_000_000_000_000),
    "killPoints": (0, 100_000_000_000),
    "deadTroops": (0, 100_000_000_000),
    "rssGathered": (0, 1_000_000_000_000),
    "helps": (0, 10_000_000),
}


def expected_kill_points(kills: dict[str, Any]) -> float:
    return sum(float(kills.get(tier, 0) or 0) * KILL_POINTS_PER_KILL[tier] for tier in TIERS)


def validate_row(row: dict[str, Any]) -> list[tuple[str, str]]:
    """Return a list of (severity, message) for one governor row."""
    issues: list[tuple[str, str]] = []

    kills = row.get("kills") or {}
    kill_points = float(row.get("killPoints", 0) or 0)
    total_kills = int(row.get("totalKills", 0) or 0)
    tier_sum = sum(int(kills.get(tier, 0) or 0) for tier in TIERS)

    has_tier_data = tier_sum > 0

    # --- Kill point reconciliation -----------------------------------------
    if has_tier_data:
        expected = expected_kill_points(kills)
        if expected > 0:
            error = abs(kill_points - expected) / expected
            if error > TOLERANCE_ERROR:
                issues.append((
                    "error",
                    f"kill points {int(kill_points):,} do not match the tier breakdown "
                    f"({int(round(expected)):,} expected, {error*100:.1f}% off)",
                ))
            elif error > TOLERANCE_WARN:
                issues.append((
                    "warn",
                    f"kill points {int(kill_points):,} are {error*100:.1f}% off the "
                    f"expected {int(round(expected)):,}",
                ))
    elif kill_points > 0:
        issues.append((
            "warn",
            "kill points present but no T1-T5 breakdown, cannot cross-check",
        ))

    # --- Total kills vs tier breakdown -------------------------------------
    if has_tier_data and total_kills > 0:
        error = abs(total_kills - tier_sum) / max(tier_sum, 1)
        if error > 0.02:
            issues.append((
                "error" if error > 0.10 else "warn",
                f"total kills {total_kills:,} does not match the tier breakdown "
                f"({tier_sum:,})",
            ))

    # --- Kill points within physical bounds --------------------------------
    if total_kills > 0:
        max_kp = total_kills * KILL_POINTS_PER_KILL["t5"]
        min_kp = total_kills * KILL_POINTS_PER_KILL["t1"]
        if kill_points > max_kp * 1.02:
            issues.append((
                "error",
                f"kill points {int(kill_points):,} exceed the maximum possible "
                f"{int(max_kp):,} for {total_kills:,} kills",
            ))
        elif kill_points < min_kp * 0.98:
            issues.append((
                "warn",
                f"kill points {int(kill_points):,} are below the minimum possible "
                f"{int(min_kp):,} for {total_kills:,} kills",
            ))

    # --- Range checks -------------------------------------------------------
    for field, (low, high) in LIMITS.items():
        value = float(row.get(field, 0) or 0)
        if value < low or value > high:
            issues.append((
                "error",
                f"{field} {int(value):,} is outside the possible range",
            ))

    return issues


def validate_scan(scan: dict[str, Any]) -> dict[str, Any]:
    governors = scan.get("governors", [])
    failures = []
    ok = warn = error = 0

    for row in governors:
        issues = validate_row(row)
        if not issues:
            ok += 1
            continue
        if any(sev == "error" for sev, _ in issues):
            error += 1
        else:
            warn += 1
        failures.append({"row": row, "issues": issues})

    total = len(governors)
    return {
        "label": scan.get("label"),
        "kingdom": scan.get("kingdom"),
        "scannedAt": scan.get("scannedAt"),
        "rows": total,
        "ok": ok,
        "warn": warn,
        "error": error,
        "clean_share": (ok / total) if total else 0.0,
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="Scan JSON file or a directory of scan files")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero if any row is only a warning",
    )
    args = parser.parse_args()

    target = Path(args.path)
    if target.is_dir():
        files = sorted(target.rglob("*.json"))
        files = [f for f in files if f.name != "index.json"]
    else:
        files = [target]

    if not files:
        print(f"No scan files found at {target}", file=sys.stderr)
        return 1

    overall_error = False
    overall_warn = False
    grand_rows = grand_ok = 0

    for file in files:
        try:
            # utf-8-sig so a BOM written by Windows tools does not break parsing.
            scan = json.loads(file.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exc:
            print(f"! {file.name}: invalid JSON - {exc}", file=sys.stderr)
            overall_error = True
            continue

        result = validate_scan(scan)
        grand_rows += result["rows"]
        grand_ok += result["ok"]

        status = "OK" if result["error"] == 0 and result["warn"] == 0 else (
            "FAIL" if result["error"] else "WARN"
        )
        print(
            f"[{status}] {file.name}: {result['ok']}/{result['rows']} verified"
            + (f", {result['warn']} suspect" if result["warn"] else "")
            + (f", {result['error']} failed" if result["error"] else "")
        )

        for failure in result["failures"]:
            row = failure["row"]
            name = row.get("name", "?")
            print(f"    - #{row.get('rank', '?')} {name}")
            for severity, message in failure["issues"]:
                print(f"        [{severity}] {message}")
                if severity == "error":
                    overall_error = True
                else:
                    overall_warn = True

    if grand_rows:
        print(
            f"\nOverall: {grand_ok}/{grand_rows} rows verified "
            f"({grand_ok/grand_rows*100:.1f}% clean)"
        )

    if overall_error:
        return 2
    if overall_warn and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
