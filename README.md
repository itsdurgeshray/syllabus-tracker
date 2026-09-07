# Syllabus Tracker

A fast, minimal study tracker for **SSC CGL** — Tier 1, Tier 2 Paper 1, and Tier 2 Paper 2 (Statistics). No build step: open `index.html` and go.

## Features

- Full syllabus checklist for all three papers, with foundational/related topics flagged separately from core syllabus
- Attach any number of **resources** to a topic — name + link, labeled Learning / Test / Reference, previewed with the link's own favicon (YouTube, PW, Testbook, or any site)
- Rich text **notes** per topic (Tiptap editor: bold/italic/strike, lists, blockquote), plus **Revise / Unclear / Skip** status tags
- **Dashboard** with completion rings, per-section progress bars, a 91-day activity heatmap, streaks, a pace-based estimate of days remaining, and a "needs attention" rollup of flagged topics
- Instant fuzzy search (`/` to focus) across every topic in the syllabus
- **Google sign-in with cross-device sync**: signed out, everything is saved to `localStorage` only; signed in, the same state syncs to Firestore in real time, so progress survives a cleared cache and follows you to any device on the same Google account
- Responsive layout: sidebar navigation on desktop, collapses to a horizontal top bar on mobile
- Geist + Geist Mono throughout, light theme

## Cloud sync setup (Firebase)

`firebase-sync.js` holds the Firebase Web config (safe to keep in the repo — it identifies the project, it isn't a secret; access is enforced by Firestore's security rules, not by hiding this value). To point it at your own project:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com), register a Web app, and copy its `firebaseConfig` into `firebase-sync.js`.
2. **Authentication → Sign-in method** → enable **Google**.
3. **Authentication → Settings → Authorized domains** → add your GitHub Pages domain (`localhost` is included by default).
4. **Firestore Database** → create a database, then set these rules so each account can only read/write its own document:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

**Deploy target matters for sign-in.** Google Sign-In needs the app's own origin to match `authDomain`, or Safari's cross-site storage rules silently break the redirect result on the way back (OAuth succeeds, but the app never sees it). Hosting on the same Firebase project sidesteps this entirely:
```bash
npm install -g firebase-tools
firebase login
cd syllabus-tracker
firebase deploy --only hosting
```
This publishes to `https://<project-id>.web.app`, on the same origin as `authDomain` — that's the URL to actually use sign-in from. Hosting elsewhere (Vercel, GitHub Pages, etc.) still works for the rest of the app, just not reliably for sign-in in Safari.

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
data.js       Syllabus content (Tier 1 / Tier 2 Paper 1 / Tier 2 Paper 2)
app.js        State, rendering, analytics (streaks, heatmap, pace)
```

## Editing the syllabus

All content lives in `data.js` as plain objects — add, rename, or remove topics there; the UI (checklist, progress bars, dashboard stats) recomputes automatically. Mark a topic `{ t: "...", r: 1 }` to flag it as foundational/related rather than directly examined.
