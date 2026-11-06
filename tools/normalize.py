#!/usr/bin/env python3
"""
Normalise tracker output into the dashboard's JSON schema.

Reads the CSV / XLSX / JSONL files produced by the community Rise of Kingdoms
trackers (Cyrexxis/RokTracker, nikolakis1919/RokTracker, Nexor256/RoK-Tracker,
mohd1024/RoKStat) and writes one JSON file per scan into ``public/data/scans``
plus an ``index.json`` the dashboard reads.

Usage
-----
    python tools/normalize.py \
        --input  "C:/RokTracker/scans/KVK4-pass4" \
        --output public/data \
        --label  "KVK4 pass 4" \
        --scope  kingdom \
        --kingdom 3518

The input directory may contain any mix of ``.csv``, ``.xlsx`` and ``.jsonl``
files; each file becomes one scan. Column names are matched case-insensitively
against a table of known aliases, so most tracker exports work unmodified.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------
# Column alias table
# --------------------------------------------------------------------------

ALIASES: dict[str, tuple[str, ...]] = {
    "id": (
        "governor id", "governorid", "id", "gov id", "player id", "uid",
        "governor_id", "playerid",
    ),
    "name": (
        "governor name", "governorname", "name", "nickname", "player name",
        "governor", "player",
    ),
    "alliance": (
        "alliance", "alliance name", "alliance tag", "tag", "alliance name (tag)",
        "alliance (tag)",
    ),
    "power": ("power", "total power", "governor power", "power (total)"),
    "killPoints": (
        "kill points", "killpoints", "kill pts", "kp", "total kill points",
        "killpoint", "kills points",
    ),
    "rangedPoints": (
        "ranged points", "rangedpoints", "ranged pts", "ranged",
    ),
    "t1": ("t1 kill", "t1 kills", "kill t1", "t1", "t1 kills (t1)"),
    "t2": ("t2 kill", "t2 kills", "kill t2", "t2", "t2 kills (t2)"),
    "t3": ("t3 kill", "t3 kills", "kill t3", "t3", "t3 kills (t3)"),
    "t4": ("t4 kill", "t4 kills", "kill t4", "t4", "t4 kills (t4)"),
    "t5": ("t5 kill", "t5 kills", "kill t5", "t5", "t5 kills (t5)"),
    "totalKills": ("total kills", "totalkills", "kills", "total kill"),
    "deadTroops": (
        "dead troops", "deadtroops", "deaths", "dead", "troops lost",
        "dead troop",
    ),
    "rssGathered": (
        "rss gathered", "rssgathered", "gathered rss", "rss gathered (total)",
        "rss", "resources gathered",
    ),
    "rssAssistance": (
        "rss assistance", "rssassistance", "sent rss", "assistance",
        "rss assistance (sent rss)",
    ),
    "helps": ("helps", "help times", "help", "helped"),
}

# Columns whose value is a number.
NUMERIC = {
    "power", "killPoints", "rangedPoints", "t1", "t2", "t3", "t4", "t5",
    "totalKills", "deadTroops", "rssGathered", "rssAssistance", "helps",
}

TRUE_VALUES = {"true", "yes", "y", "1", "inactive", "x"}


def normalise_header(name: str) -> str:
    """Lowercase and strip anything that is not alphanumeric."""
    return re.sub(r"[^a-z0-9]+", " ", str(name).strip().lower()).strip()


def build_column_map(headers: list[str]) -> dict[str, int]:
    """Map schema field -> column index, using the alias table."""
    normalised = [normalise_header(h) for h in headers]
    mapping: dict[str, int] = {}

    for field, aliases in ALIASES.items():
        for alias in aliases:
            alias_norm = normalise_header(alias)
            for idx, header in enumerate(normalised):
                if header == alias_norm or alias_norm in header:
                    mapping.setdefault(field, idx)
                    break
            if field in mapping:
                break

    return mapping


def parse_number(value: Any) -> int:
    """Parse a number out of a messy cell, tolerating separators and suffixes."""
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip()
    if not text:
        return 0

    text = text.replace(",", "").replace(" ", "").replace("\u00a0", "")
    # Strip trailing unit suffixes such as "12M" or "3.4K".
    multiplier = 1
    if text and text[-1] in "KkMmBb":
        suffix = text[-1].upper()
        multiplier = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[suffix]
        text = text[:-1]

    # Keep digits, dots and a leading minus.
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return 0

    try:
        return int(float(match.group(0)) * multiplier)
    except ValueError:
        return 0


def parse_bool(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in TRUE_VALUES


def row_to_governor(row: list[Any], column_map: dict[str, int], rank: int) -> dict[str, Any]:
    def cell(field: str) -> Any:
        idx = column_map.get(field)
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    kills = {tier: parse_number(cell(tier)) for tier in ("t1", "t2", "t3", "t4", "t5")}
    total_kills = parse_number(cell("totalKills"))
    if not total_kills:
        total_kills = sum(kills.values())
    if not kills["t4"] and not kills["t5"] and total_kills:
        # Some exports only carry T4+T5 combined; split it evenly so the
        # dashboard still shows a sensible high-tier figure.
        combined = parse_number(cell("highTierKills"))
        if combined:
            kills["t4"] = combined // 2
            kills["t5"] = combined - kills["t4"]

    governor_id = str(cell("id") or "").strip()
    name = str(cell("name") or "").strip()
    alliance = str(cell("alliance") or "").strip()

    return {
        "id": governor_id or f"row-{rank}",
        "name": name or f"Governor {rank}",
        "alliance": alliance,
        "power": parse_number(cell("power")),
        "killPoints": parse_number(cell("killPoints")),
        "rangedPoints": parse_number(cell("rangedPoints")),
        "kills": kills,
        "totalKills": total_kills,
        "highTierKills": kills["t4"] + kills["t5"],
        "deadTroops": parse_number(cell("deadTroops")),
        "rssGathered": parse_number(cell("rssGathered")),
        "rssAssistance": parse_number(cell("rssAssistance")),
        "helps": parse_number(cell("helps")),
        "rank": rank,
        "inactive": parse_bool(cell("inactive")),
    }


# --------------------------------------------------------------------------
# Readers
# --------------------------------------------------------------------------

def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        sample = handle.read(4096)
        handle.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.reader(handle, dialect)
        rows = [row for row in reader if any(str(c).strip() for c in row)]

    if not rows:
        return []
    header = rows[0]
    column_map = build_column_map(header)
    out = []
    for rank, row in enumerate(rows[1:], start=1):
        out.append(row_to_governor(row, column_map, rank))
    return out


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    out = []
    for rank, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        headers = list(payload.keys())
        column_map = build_column_map(headers)
        row = [payload.get(h) for h in headers]
        out.append(row_to_governor(row, column_map, rank))
    return out


def read_xlsx(path: Path) -> list[dict[str, Any]]:
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise SystemExit(
            "Reading .xlsx requires openpyxl. Install it with:\n"
            "    pip install openpyxl"
        )

    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    rows = [list(r) for r in sheet.iter_rows(values_only=True)]
    workbook.close()

    rows = [r for r in rows if any(c is not None and str(c).strip() for c in r)]
    if not rows:
        return []

    header = [str(c) if c is not None else "" for c in rows[0]]
    column_map = build_column_map(header)
    out = []
    for rank, row in enumerate(rows[1:], start=1):
        out.append(row_to_governor(row, column_map, rank))
    return out


READERS = {".csv": read_csv, ".xlsx": read_xlsx, ".xlsm": read_xlsx, ".jsonl": read_jsonl}


# --------------------------------------------------------------------------
# Writer
# --------------------------------------------------------------------------

def slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return slug or "scan"


def write_scan(
    output_dir: Path,
    governors: list[dict[str, Any]],
    label: str,
    scope: str,
    kingdom: str | None,
    alliance: str | None,
    scanned_at: str | None,
) -> dict[str, Any]:
    scans_dir = output_dir / "scans"
    scans_dir.mkdir(parents=True, exist_ok=True)

    stamp = scanned_at or datetime.now(timezone.utc).isoformat()
    # Filename-safe timestamp.
    safe_stamp = re.sub(r"[:+]", "-", stamp.replace("Z", "Z"))
    filename = f"{safe_stamp}-{slugify(label)}.json"

    scan = {
        "scannedAt": stamp,
        "label": label,
        "scope": scope,
        "kingdom": kingdom,
        "alliance": alliance,
        "governors": governors,
    }

    (scans_dir / filename).write_text(
        json.dumps(scan, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return {
        "scannedAt": stamp,
        "label": label,
        "scope": scope,
        "kingdom": kingdom,
        "alliance": alliance,
        "count": len(governors),
        "file": f"data/scans/{filename}",
    }


def rebuild_index(output_dir: Path) -> int:
    """Rebuild index.json from everything present in the scans directory."""
    scans_dir = output_dir / "scans"
    entries: list[dict[str, Any]] = []

    for path in sorted(scans_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        entries.append(
            {
                "scannedAt": payload.get("scannedAt", ""),
                "label": payload.get("label", path.stem),
                "scope": payload.get("scope", "kingdom"),
                "kingdom": payload.get("kingdom"),
                "alliance": payload.get("alliance"),
                "count": len(payload.get("governors", [])),
                "file": f"data/scans/{path.name}",
            }
        )

    entries.sort(key=lambda e: e["scannedAt"], reverse=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "index.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return len(entries)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="File or directory of tracker output")
    parser.add_argument("--output", default="public/data", help="Output directory (default: public/data)")
    parser.add_argument("--label", default="Scan", help="Human label for this scan")
    parser.add_argument(
        "--scope", default="kingdom", choices=["kingdom", "alliance", "honor"],
        help="Which leaderboard was scanned",
    )
    parser.add_argument("--kingdom", default=None, help="Kingdom number")
    parser.add_argument("--alliance", default=None, help="Alliance tag")
    parser.add_argument(
        "--scanned-at", default=None,
        help="ISO timestamp of the scan (defaults to now)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output)

    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 1

    files: list[Path] = []
    if input_path.is_dir():
        for ext in READERS:
            files.extend(sorted(input_path.glob(f"*{ext}")))
        files = [f for f in files if not f.name.startswith("~$")]
    else:
        files = [input_path]

    if not files:
        print(f"No CSV/XLSX/JSONL files found in {input_path}", file=sys.stderr)
        return 1

    written = 0
    for file in files:
        reader = READERS.get(file.suffix.lower())
        if reader is None:
            continue
        try:
            governors = reader(file)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"  ! failed to read {file.name}: {exc}", file=sys.stderr)
            continue

        if not governors:
            print(f"  - {file.name}: no rows")
            continue

        entry = write_scan(
            output_dir,
            governors,
            label=args.label,
            scope=args.scope,
            kingdom=args.kingdom,
            alliance=args.alliance,
            scanned_at=args.scanned_at,
        )
        print(f"  + {file.name} -> {entry['file']} ({entry['count']} governors)")
        written += 1

    total_entries = rebuild_index(output_dir)
    print(f"Wrote {written} scan(s); index now lists {total_entries}.")

    if written == 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
