"""
Build samples.min.json from public AADR Visualizer metadata.

This keeps the browser app simple: download the large public CSV once, trim it
to map-relevant fields, normalize major haplogroup labels, and write a small
JSON file used by the static frontend.

Run from the repository root:
    python scripts/build_samples.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable

import pandas as pd
from tqdm.auto import tqdm

AADR_VISUALIZER_CSV = "https://raw.githubusercontent.com/MYangLab/aadr-visualizer/main/aadr_noRefPresent_v62.csv"
OUT_PATH = Path("samples.min.json")

COLUMN_CANDIDATES = {
    "id": ["Genetic ID", "genetic_id", "sample_id", "ID", "id"],
    "lat": ["GISLat", "lat", "latitude", "Latitude"],
    "lon": ["GISLon", "lon", "longitude", "Longitude"],
    "ybp": ["Date mean in BP [OxCal mu for a direct radiocarbon date, and average of range for a contextual date]", "ybp", "date_bp", "DateBP"],
    "population": ["Group ID", "groupID", "Group_Name", "population", "Population"],
    "ydna": ["Y haplogroup (manual curation in ISOGG format)", "yhaplo_isogg", "yhaplo_term", "Y haplogroup", "ydna"],
    "mtdna": ["mtDNA haplogroup if >2x or published", "mtDNA_haplo", "mtDNA haplogroup", "mtdna"],
    "site": ["Locality", "site", "Site", "locality"],
    "country": ["Country", "country"],
}


def first_existing(columns: Iterable[str], candidates: list[str]) -> str | None:
    lookup = {c.lower().strip(): c for c in columns}
    for candidate in candidates:
        key = candidate.lower().strip()
        if key in lookup:
            return lookup[key]
    return None


def major_y(value: object) -> str:
    x = str(value or "").strip()
    if not x or x.lower() == "nan":
        return "Unknown"
    rules = [
        (r"^R1b", "R1b"),
        (r"^R1a", "R1a"),
        (r"^J2", "J2"),
        (r"^G2", "G2"),
        (r"^I2", "I2"),
        (r"^E1b|^E-M", "E1b"),
        (r"^J1", "J1"),
        (r"^I1", "I1"),
        (r"^Q", "Q"),
        (r"^C", "C"),
        (r"^N", "N"),
        (r"^O", "O"),
    ]
    for pattern, label in rules:
        if re.search(pattern, x, re.I):
            return label
    return re.split(r"[\s\-*_/.]", x)[0] or "Unknown"


def major_mt(value: object) -> str:
    x = str(value or "").strip()
    if not x or x.lower() == "nan":
        return "Unknown"
    match = re.match(r"^[A-Za-z]+", x)
    return match.group(0).upper()[:1] if match else "Unknown"


def main() -> None:
    print("Downloading AADR Visualizer metadata...")
    df = pd.read_csv(AADR_VISUALIZER_CSV, low_memory=False)
    print(f"Loaded {len(df):,} rows and {len(df.columns):,} columns")

    resolved = {field: first_existing(df.columns, names) for field, names in COLUMN_CANDIDATES.items()}
    print("\nResolved columns:")
    for field, column in resolved.items():
        print(f"  {field:>10}: {column}")

    missing_required = [field for field in ["id", "lat", "lon", "ybp"] if resolved[field] is None]
    if missing_required:
        raise ValueError(f"Missing required columns: {missing_required}")

    rows = []
    print("\nCleaning rows...")
    for _, row in tqdm(df.iterrows(), total=len(df)):
        lat = pd.to_numeric(row.get(resolved["lat"]), errors="coerce")
        lon = pd.to_numeric(row.get(resolved["lon"]), errors="coerce")
        ybp = pd.to_numeric(row.get(resolved["ybp"]), errors="coerce")
        if pd.isna(lat) or pd.isna(lon) or pd.isna(ybp):
            continue

        ydna = str(row.get(resolved["ydna"], "") or "") if resolved["ydna"] else ""
        mtdna = str(row.get(resolved["mtdna"], "") or "") if resolved["mtdna"] else ""

        rows.append(
            {
                "id": str(row.get(resolved["id"], "")),
                "lat": round(float(lat), 4),
                "lon": round(float(lon), 4),
                "ybp": round(float(ybp), 1),
                "population": str(row.get(resolved["population"], "Unknown")) if resolved["population"] else "Unknown",
                "ydna": ydna if ydna and ydna.lower() != "nan" else "Unknown",
                "ydna_major": major_y(ydna),
                "mtdna": mtdna if mtdna and mtdna.lower() != "nan" else "Unknown",
                "mtdna_major": major_mt(mtdna),
                "site": str(row.get(resolved["site"], "")) if resolved["site"] else "",
                "country": str(row.get(resolved["country"], "")) if resolved["country"] else "",
            }
        )

    rows.sort(key=lambda item: item["ybp"], reverse=True)
    OUT_PATH.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
    print(f"\nWrote {len(rows):,} cleaned samples to {OUT_PATH}")
    print(f"Approx file size: {OUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
