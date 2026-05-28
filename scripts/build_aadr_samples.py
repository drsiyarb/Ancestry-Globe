"""
Build samples.min.json from the public AADR Visualizer CSV.

This version uses only the Python standard library so GitHub Actions can run it
without installing pandas. It downloads the map-ready AADR Visualizer CSV,
keeps only the fields needed by the globe, normalizes broad Y-DNA/mtDNA labels,
and writes samples.min.json.

Run:
    python scripts/build_aadr_samples.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from pathlib import Path
from tempfile import NamedTemporaryFile

SOURCE_URL = "https://raw.githubusercontent.com/MYangLab/aadr-visualizer/main/aadr_noRefPresent_v62.csv"
OUT_PATH = Path("samples.min.json")

CANDIDATES = {
    "id": ["genID", "Genetic ID", "sample_id", "ID", "id"],
    "lat": ["GISLat", "lat", "latitude", "Latitude"],
    "lon": ["GISLon", "lon", "longitude", "Longitude"],
    "ybp": ["ybp", "DateBP", "date_bp", "Date mean in BP [OxCal mu for a direct radiocarbon date, and average of range for a contextual date]"],
    "population": ["groupID", "Group ID", "Group_Name", "population", "Population"],
    "ydna": ["yhaplo_isogg", "yhaplo_term", "Y haplogroup", "ydna"],
    "mtdna": ["mtDNA_haplo", "mtDNA haplogroup", "mtdna"],
    "site": ["locality", "Locality", "site", "Site"],
    "country": ["political_entity", "Country", "country"],
    "region": ["region", "Region"],
    "subregion": ["sub-region", "subregion", "Subregion"],
}


def download(url: str) -> Path:
    print(f"Downloading metadata from: {url}")
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()

    tmp = NamedTemporaryFile(delete=False, suffix=".csv")
    tmp.write(data)
    tmp.close()
    path = Path(tmp.name)
    print(f"Downloaded {len(data) / 1024 / 1024:.2f} MB to {path}")
    return path


def resolve(fieldnames: list[str]) -> dict[str, str | None]:
    lookup = {name.lower().strip(): name for name in fieldnames}
    resolved = {}
    for field, candidates in CANDIDATES.items():
        resolved[field] = None
        for candidate in candidates:
            key = candidate.lower().strip()
            if key in lookup:
                resolved[field] = lookup[key]
                break
    return resolved


def get(row: dict[str, str], column: str | None, default: str = "") -> str:
    if not column:
        return default
    value = row.get(column, default)
    if value is None:
        return default
    value = str(value).strip()
    if value.lower() in {"", "nan", "none", ".."}:
        return default
    return value


def as_float(value: str) -> float | None:
    try:
        return float(value)
    except Exception:
        return None


def major_y(value: str) -> str:
    x = value.strip()
    if not x:
        return "Unknown"
    rules = [
        (r"^R1b", "R1b"),
        (r"^R1a", "R1a"),
        (r"^J2", "J2"),
        (r"^J1", "J1"),
        (r"^G2", "G2"),
        (r"^I2", "I2"),
        (r"^I1", "I1"),
        (r"^E1b|^E-M", "E1b"),
        (r"^Q", "Q"),
        (r"^C", "C"),
        (r"^N", "N"),
        (r"^O", "O"),
        (r"^L", "L"),
        (r"^T", "T"),
    ]
    for pattern, label in rules:
        if re.search(pattern, x, re.I):
            return label
    return re.split(r"[\s\-*_/.]", x)[0] or "Unknown"


def major_mt(value: str) -> str:
    x = value.strip()
    if not x:
        return "Unknown"
    match = re.match(r"^[A-Za-z]+", x)
    return match.group(0).upper()[:1] if match else "Unknown"


def main() -> None:
    csv_path = download(SOURCE_URL)

    rows = []
    total = 0
    skipped = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise RuntimeError("CSV has no header row.")

        resolved = resolve(reader.fieldnames)
        print("Resolved columns:")
        for key, value in resolved.items():
            print(f"  {key:>10}: {value}")

        required = ["id", "lat", "lon", "ybp"]
        missing = [field for field in required if not resolved[field]]
        if missing:
            print(f"ERROR: Missing required columns: {missing}", file=sys.stderr)
            print(f"Available columns: {reader.fieldnames}", file=sys.stderr)
            sys.exit(1)

        for row in reader:
            total += 1
            lat = as_float(get(row, resolved["lat"]))
            lon = as_float(get(row, resolved["lon"]))
            ybp = as_float(get(row, resolved["ybp"]))
            if lat is None or lon is None or ybp is None:
                skipped += 1
                continue

            ydna = get(row, resolved["ydna"], "Unknown")
            mtdna = get(row, resolved["mtdna"], "Unknown")

            rows.append(
                {
                    "id": get(row, resolved["id"], "Unknown"),
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "ybp": round(ybp, 1),
                    "population": get(row, resolved["population"], "Unknown"),
                    "ydna": ydna,
                    "ydna_major": major_y(ydna),
                    "mtdna": mtdna,
                    "mtdna_major": major_mt(mtdna),
                    "site": get(row, resolved["site"], ""),
                    "country": get(row, resolved["country"], ""),
                    "region": get(row, resolved["region"], ""),
                    "subregion": get(row, resolved["subregion"], ""),
                }
            )

    rows.sort(key=lambda item: item["ybp"], reverse=True)
    OUT_PATH.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")

    print(f"Read {total:,} rows")
    print(f"Skipped {skipped:,} rows without usable lat/lon/ybp")
    print(f"Wrote {len(rows):,} cleaned samples to {OUT_PATH}")
    print(f"Output size: {OUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
