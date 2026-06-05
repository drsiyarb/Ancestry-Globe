#!/usr/bin/env python3
"""
Extract curated-gene genotypes from AADR v66 1240k .geno (TGENO transpose_packed).

Layout (confirmed from exact file size = 48 + nind*rlen):
  48-byte header, then one record per INDIVIDUAL, rlen = max(48, ceil(nsnp/4)) bytes.
  Individual i (0-based, from .ind order) starts at byte 48 + i*rlen.
  SNP j within a record: byte j//4, bits (6 - 2*(j%4)); value 0,1,2 or 3(missing).

The 2-bit value counts one allele; whether it's the reference or variant allele is
auto-detected by calibrate() using lactase persistence (must rise toward the present).
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(ROOT, "out")
GENO = os.path.join(DATA, "v66.1240K.aadr.PUB.geno")
os.makedirs(os.path.join(OUT, "genes"), exist_ok=True)
genes = json.load(open(os.path.join(ROOT, "scripts", "genes.json")))["genes"]
samples = json.load(open(os.path.join(OUT, "samples.json")))

want = {(g["chrom"], g["pos"]): g for g in genes}
snp_row = {}
with open(os.path.join(DATA, "v66.1240K.aadr.PUB.snp"), encoding="utf-8", errors="replace") as f:
    for i, line in enumerate(f):
        p = line.split()
        if (int(p[1]), int(p[3])) in want:
            snp_row[want[(int(p[1]), int(p[3]))]["id"]] = i

with open(GENO, "rb") as f:
    h = f.read(48).split()
nind, nsnp = int(h[1]), int(h[2])
assert h[0] == b"TGENO", h[0]
rlen = max(48, (nsnp + 3) // 4)
max_idx = (os.path.getsize(GENO) - 48) // rlen - 1
print("TGENO nind=%d nsnp=%d rlen=%d  individuals available=%d/%d"
      % (nind, nsnp, rlen, max_idx + 1, nind))

GF = open(GENO, "rb")
def gval(ind, snp):
    GF.seek(48 + ind * rlen + (snp >> 2))
    b = GF.read(1)
    return (b[0] >> (6 - 2 * (snp & 3))) & 3 if b else 3

def calibrate():
    """Return True if the raw value counts the REFERENCE allele.
    Uses LCT (trait allele is the variant 'A'); persistence rises toward the present."""
    row = snp_row["LCT"]
    recs = []
    for s in samples:
        if s["idx"] > max_idx:
            continue
        v = gval(s["idx"], row)
        if v != 3:
            recs.append((s["modern"], s["ybp"], v))

    def diff(v_is_ref):
        ao = an = mo = mn = 0
        for modern, ybp, v in recs:
            refc = v if v_is_ref else (2 - v)
            d = 2 - refc                       # trait A is the variant allele
            if modern:
                mo += d; mn += 1
            elif ybp > 7000:
                ao += d; an += 1
        fa = ao / (2 * an) if an else 0
        fm = mo / (2 * mn) if mn else 0
        return fm - fa, fa, fm

    d_ref, fa_r, fm_r = diff(True)
    d_var, fa_v, fm_v = diff(False)
    v_is_ref = d_ref >= d_var
    fa, fm = (fa_r, fm_r) if v_is_ref else (fa_v, fm_v)
    print("calibration (LCT lactase persistence): value counts %s allele"
          % ("REFERENCE" if v_is_ref else "VARIANT"))
    print("  ancient(>7000ybp)=%.3f  modern=%.3f  %s"
          % (fa, fm, "OK (rises to present)" if fm > fa + 0.1 else "WARNING: weak/!inverted signal"))
    return v_is_ref

V_IS_REF = calibrate()
json.dump({"header": 48, "rlen": rlen, "value_counts_ref": V_IS_REF},
          open(os.path.join(OUT, "encoding.json"), "w"))

BIN, NB = 500, 30
summary = []
for g in genes:
    j = snp_row[g["id"]]
    ta_is_ref = (g["trait_allele"] == g["ref"])
    pts = []
    n_typed = n_missing = sum_d = 0
    anc_d = anc_n = mod_d = mod_n = 0
    bsum = [0.0] * (NB + 1); bn = [0] * (NB + 1)
    for s in samples:
        if s["idx"] > max_idx:
            continue
        v = gval(s["idx"], j)
        if v == 3:
            n_missing += 1
            continue
        refc = v if V_IS_REF else (2 - v)
        d = refc if ta_is_ref else (2 - refc)
        n_typed += 1; sum_d += d
        pts.append([s["lat"], s["lon"], s["ybp"], s["modern"], d])
        b = max(0, min(NB, s["ybp"] // BIN)); bsum[b] += d; bn[b] += 1
        if s["modern"]:
            mod_d += d; mod_n += 1
        else:
            anc_d += d; anc_n += 1
    freq = sum_d / (2 * n_typed) if n_typed else 0
    af_anc = anc_d / (2 * anc_n) if anc_n else float("nan")
    af_mod = mod_d / (2 * mod_n) if mod_n else float("nan")
    traj = [[b * BIN, (round(bsum[b] / (2 * bn[b]), 3) if bn[b] >= 3 else None), bn[b]]
            for b in range(NB + 1)]
    json.dump({"gene": g, "points": pts, "trajectory": traj},
              open(os.path.join(OUT, "genes", g["id"] + ".json"), "w"),
              separators=(",", ":"))
    summary.append({"id": g["id"], "n": n_typed, "freq": round(freq, 4),
                    "anc": None if anc_n == 0 else round(af_anc, 4),
                    "mod": None if mod_n == 0 else round(af_mod, 4)})
    print("  %-8s typed=%6d miss=%6d freq=%.3f ancient=%.3f modern=%.3f"
          % (g["id"], n_typed, n_missing, freq, af_anc, af_mod))
json.dump(summary, open(os.path.join(OUT, "genes_summary.json"), "w"))
print("done.")
