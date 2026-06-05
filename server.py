#!/usr/bin/env python3
"""
Ancestry Globe server (stdlib only).
- Serves the static app + committed data (curated genes, samples, encoding).
- GET /api/snp?rsid=... -> live arbitrary-SNP extraction, ONLY if the AADR
  genotype files are present (local dev / a Railway volume). Degrades gracefully.
Run:  python server.py   (honours $PORT; binds 0.0.0.0)
"""
import json, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
GENO = os.path.join(DATA, "v66.1240K.aadr.PUB.geno")
SNP  = os.path.join(DATA, "v66.1240K.aadr.PUB.snp")
PORT = int(os.environ.get("PORT", "8000"))

SNP_ENABLED = False
RSIDX = {}
SAMPLES = []
try:
    SAMPLES = json.load(open(os.path.join(ROOT, "out", "samples.json")))
    if os.path.exists(GENO) and os.path.exists(SNP) and os.path.exists(os.path.join(ROOT, "out", "encoding.json")):
        ENC = json.load(open(os.path.join(ROOT, "out", "encoding.json")))
        V_IS_REF = ENC["value_counts_ref"]
        with open(SNP, encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                p = line.split()
                RSIDX[p[0]] = (i, int(p[1]), int(p[3]), p[4], p[5])
        with open(GENO, "rb") as f:
            h = f.read(48).split()
        NIND, NSNP = int(h[1]), int(h[2])
        RLEN = max(48, (NSNP + 3) // 4)
        MAXIDX = (os.path.getsize(GENO) - 48) // RLEN - 1
        GF = open(GENO, "rb")
        SNP_ENABLED = True
        print("SNP search ENABLED (%d SNPs, %d/%d individuals)" % (len(RSIDX), MAXIDX + 1, NIND))
    else:
        print("SNP search DISABLED (genotype files not present) — genes + haplogroups still work.")
except Exception as e:
    print("startup note:", e)

BIN, NB = 500, 30

def gval(ind, snp):
    GF.seek(48 + ind * RLEN + (snp >> 2))
    b = GF.read(1)
    return (b[0] >> (6 - 2 * (snp & 3))) & 3 if b else 3

def extract(rsid):
    if not SNP_ENABLED:
        return {"error": "SNP search is only available when the AADR genotype file is present (run locally, or attach a Railway volume)."}
    rec = RSIDX.get(rsid)
    if not rec:
        return {"error": rsid + " not found on the 1240k panel"}
    row, chrom, pos, ref, var = rec
    pts, bsum, bn = [], [0.0] * (NB + 1), [0] * (NB + 1)
    n = 0
    for s in SAMPLES:
        if s["idx"] > MAXIDX:
            continue
        v = gval(s["idx"], row)
        if v == 3:
            continue
        refc = v if V_IS_REF else (2 - v)
        d = 2 - refc
        n += 1
        pts.append([s["lat"], s["lon"], s["ybp"], s["modern"], d])
        b = max(0, min(NB, s["ybp"] // BIN)); bsum[b] += d; bn[b] += 1
    traj = [[b * BIN, (round(bsum[b] / (2 * bn[b]), 3) if bn[b] >= 3 else None), bn[b]] for b in range(NB + 1)]
    return {"rsid": rsid, "chrom": chrom, "pos": pos, "ref": ref, "var": var,
            "trait_allele": var, "n": n, "points": pts, "trajectory": traj}

class H(SimpleHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/snp":
            rsid = (parse_qs(u.query).get("rsid", [""])[0]).strip()
            body = json.dumps(extract(rsid)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
            return
        return super().do_GET()
    def log_message(self, *a): pass

os.chdir(ROOT)
print("serving on 0.0.0.0:%d" % PORT)
ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
