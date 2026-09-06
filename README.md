# Syllabus Tracker

A fast, minimal study tracker for **SSC CGL** — Tier 1, Tier 2 Paper 1, and Tier 2 Paper 3 (Finance & Economics). No build step, no backend: open `index.html` and go.

## Features

- Full syllabus checklist for all three papers, with foundational/related topics flagged separately from core syllabus
- Attach any number of **resources** to a topic — name + link, labeled Learning / Test / Reference, previewed with the link's own favicon (YouTube, PW, Testbook, or any site)
- **Dashboard** with completion rings, per-section progress bars, a 91-day activity heatmap, streaks, and a pace-based estimate of days remaining
- Instant fuzzy search (`/` to focus) across every topic in the syllabus
- Progress and completion dates saved locally in the browser (`localStorage`) — nothing leaves your device
- Responsive layout: sidebar navigation on desktop, collapses to a horizontal top bar on mobile
- Geist + Geist Mono throughout, light theme

## Run locally

No dependencies to install — just serve the folder statically:

```bash
npx serve .
```

or simply open `index.html` directly in a browser.

## Deploy (GitHub Pages)

1. Push to `main`.
2. In the repo settings, enable **Pages** → source: `Deploy from a branch` → branch `main`, folder `/ (root)`.
3. The site will be live at `https://<username>.github.io/syllabus-tracker/`.

## Project structure

```
index.html    Page shell, sidebar nav, topbar/search
styles.css    Design tokens, layout, components (Geist fonts)
data.js       Syllabus content (Tier 1 / Tier 2 Paper 1 / Tier 2 Paper 3)
app.js        State, rendering, analytics (streaks, heatmap, pace)
```

## Editing the syllabus

All content lives in `data.js` as plain objects — add, rename, or remove topics there; the UI (checklist, progress bars, dashboard stats) recomputes automatically. Mark a topic `{ t: "...", r: 1 }` to flag it as foundational/related rather than directly examined.
