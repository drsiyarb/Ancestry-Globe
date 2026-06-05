# Ancestry Globe

An interactive 3D atlas that lets you **watch real genes and DNA lineages move across humanity** over the last ~15,000 years. Every point is a real ancient or present-day individual from the **Allen Ancient DNA Resource (AADR v66, 1240k panel)** — 19,678 individuals after QC.

![preview](og.png)

## What it does

**Genes / traits** — pick a charismatic variant (lactase persistence, light skin, blue eyes, sickle-cell/malaria resistance, EDAR, …) and watch its frequency spread across the map as you scrub through time. Or search **any SNP** by rsID (local mode).

**Y-DNA & mtDNA lineages** — colour every paternal/maternal lineage at once, or pick a single haplogroup (R1b, U5, J2a, …) and watch it sweep across continents. Type **your own haplogroup** to trace your line.

**Views** — frequency hexmap, density hexmap, smooth KDE heatmap, or individual dots. Per-window colour auto-scaling, adjustable hex size, time window, and playback pace. Export a **GIF** or **PNG** to share.

> **Scientific caution:** this shows where carriers of a variant or lineage lived, when. It is *not* a reconstruction of individual migration paths. Frequencies are interpolated for display; sparse regions are faint by design.

## Run locally

The app + curated genes + full haplogroup layer run with no data download. For the **arbitrary-SNP search** you also need the AADR genotype files.

1. Download the four AADR v66 1240k files into `data/` from the [Harvard Dataverse](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/FFIDCW):
   `v66.1240K.aadr.PUB.{anno,ind,snp,geno}`
2. Build the datasets:
   ```
   python scripts/build_metadata.py
   python scripts/extract_snps.py
   ```
3. Serve:
   ```
   python server.py
   ```
   Open http://localhost:8000

## Deploy (Railway)

Push to GitHub and deploy on Railway — it runs `python server.py` (Python stdlib only, honours `$PORT`). The committed `out/` data powers genes + haplogroups with no extra setup. Arbitrary-SNP search stays disabled on the host unless you attach the 6.7 GB genotype file via a volume.

## Data

Allen Ancient DNA Resource v66.0 (Mallick, Reich et al.), 1240k panel, hg19. Cite the AADR release and the original publications listed in the AADR `.anno` file.
