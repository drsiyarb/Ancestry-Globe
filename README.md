# Ancestry Globe

Ancestry Globe is a lightweight interactive 3D atlas for exploring ancient DNA samples, haplogroups, and lineage patterns through time.

The first version is intentionally static and minimal: no backend, no database, no login, and no build step. The browser loads a small preprocessed JSON file, renders a stylized globe, and lets users filter ancient samples by population context, Y-DNA, mtDNA, and time.

## MVP goals

- Render ancient DNA sample locations on a stylized 3D globe
- Explore samples through time with a slider and play/pause button
- Filter by population context, Y-DNA haplogroup, and mtDNA haplogroup
- Keep the app small enough for GitHub Pages and Railway static hosting
- Preserve a clear distinction between raw sample points and later interpretive flow layers

## Current structure

```text
index.html          App shell
style.css           Toy-world dark UI and mobile layout
main.js             Globe rendering, animation, filters, and time slider
groups.json         Collapsible selector configuration
samples.min.json    Small demo dataset; later generated from AADR metadata
scripts/build_samples.py  Preprocessing script for public AADR Visualizer metadata
```

## Data plan

The app expects a compact `samples.min.json` file with fields like:

```json
{
  "id": "sample_001",
  "lat": 48.2,
  "lon": 36.1,
  "ybp": 4700,
  "population": "Yamnaya",
  "ydna": "R1b-M269",
  "ydna_major": "R1b",
  "mtdna": "U5a",
  "mtdna_major": "U",
  "site": "Samara",
  "country": "Russia"
}
```

The intended real dataset source is the AADR Visualizer metadata CSV from MYangLab/aadr-visualizer, which is based on AADR v62.0. The script in `scripts/build_samples.py` is designed to download that CSV, keep only the map-relevant fields, normalize major haplogroup labels, and write `samples.min.json`.

## Local use

Because this first prototype is static, it can be opened directly in a browser. For the most reliable local behavior, serve the folder with a tiny static server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deployment

This version can be deployed as a static site on GitHub Pages or Railway. No Node, Vite, React, or backend server is required for the MVP.

## Scientific caution

The first layer shows sample locations through time. It does not claim to reconstruct exact migration paths. Any future centroid trails, arcs, or flow lines should be presented as visual summaries or hypotheses, not direct individual-level ancestry routes.
