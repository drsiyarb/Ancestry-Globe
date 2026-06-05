#!/usr/bin/env python3
"""
build_metadata.py
Parse AADR v66 1240k .anno + .ind into a clean sample table.

- .ind defines the genotype column order (row i in .ind == column i in .geno).
- .anno provides metadata keyed by Genetic ID.
- Keep QC-pass samples that have coordinates.
- Deduplicate by Individual ID, keeping the version with the most 1240k SNPs.
- Tag present-day samples (ybp == 0) as modern for the "where are you from" layer.

Output: out/samples.json  (list of records, each carries geno_idx for extraction)
"""
import csv, json, os, sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
OUT  = os.path.join(os.path.dirname(__file__), "..", "out")
os.makedirs(OUT, exist_ok=True)

ANNO = os.path.join(DATA, "v66.1240K.aadr.PUB.anno")
IND  = os.path.join(DATA, "v66.1240K.aadr.PUB.ind")

# anno column indices (0-based)
C_GID, C_INDIV, C_YBP, C_YBPSD = 0, 2, 10, 11
C_GROUP, C_COUNTRY, C_LAT, C_LON = 14, 16, 17, 18
C_COV1240K = 26          # "SNPs hit ... on 1240k snpset" -> dedup ranking
C_YDNA_ISOGG, C_YDNA_TERM = 35, 34
C_MTDNA = 38
C_ASSESS = 47

KEEP_ASSESS = {"Pass", "PROVISIONAL_PASS", "MERGE_PASS"}

def num(v):
    v = (v or "").strip()
    try:
        return float(v)
    except ValueError:
        return None

def clean(v):
    v = (v or "").strip()
    if v in ("..", ".", "n/a", "", "n/a (sex unknown)", "n/a (female)",
             "n/a (Female)", "..(Format 1)"):
        return None
    return v

# 1) genotype column order from .ind
gid_to_idx = {}
with open(IND, encoding="utf-8", errors="replace") as f:
    for i, line in enumerate(f):
        parts = line.split()
        if parts:
            gid_to_idx[parts[0]] = i
print(f".ind rows (geno columns): {len(gid_to_idx)}")

# 2) parse .anno
records = []
dropped_qc = dropped_coord = dropped_noidx = 0
with open(ANNO, encoding="utf-8", errors="replace") as f:
    r = csv.reader(f, delimiter="\t")
    next(r)  # header
    for row in r:
        if len(row) < 49:
            continue
        gid = row[C_GID].strip()
        idx = gid_to_idx.get(gid)
        if idx is None:
            dropped_noidx += 1
            continue
        if row[C_ASSESS].strip() not in KEEP_ASSESS:
            dropped_qc += 1
            continue
        lat, lon = num(row[C_LAT]), num(row[C_LON])
        if lat is None or lon is None or (lat == 0 and lon == 0):
            dropped_coord += 1
            continue
        ybp = num(row[C_YBP])
        if ybp is None:
            continue
        cov = num(row[C_COV1240K]) or 0
        records.append({
            "gid": gid,
            "idx": idx,
            "indiv": clean(row[C_INDIV]) or gid,
            "lat": round(lat, 3),
            "lon": round(lon, 3),
            "ybp": int(ybp),
            "ybp_sd": int(num(row[C_YBPSD]) or 0),
            "group": clean(row[C_GROUP]),
            "country": clean(row[C_COUNTRY]),
            "ydna": clean(row[C_YDNA_ISOGG]) or clean(row[C_YDNA_TERM]),
            "mtdna": clean(row[C_MTDNA]),
            "cov": cov,
            "modern": 1 if int(ybp) == 0 else 0,
        })

print(f"after QC+coord filter: {len(records)}  "
      f"(dropped qc={dropped_qc}, coord={dropped_coord}, no-geno-idx={dropped_noidx})")

# 3) deduplicate by Individual ID, keep highest 1240k coverage
best = {}
for rec in records:
    k = rec["indiv"]
    if k not in best or rec["cov"] > best[k]["cov"]:
        best[k] = rec
deduped = list(best.values())
deduped.sort(key=lambda r: r["ybp"])

anc = sum(1 for r in deduped if not r["modern"])
mod = len(deduped) - anc
print(f"after dedup by individual: {len(deduped)}  (ancient={anc}, modern={mod})")

# drop the per-row 'cov' to keep file small; keep idx for extraction
for r in deduped:
    del r["cov"]

with open(os.path.join(OUT, "samples.json"), "w") as f:
    json.dump(deduped, f, separators=(",", ":"))
print(f"wrote out/samples.json  ({os.path.getsize(os.path.join(OUT,'samples.json'))//1024} KB)")
