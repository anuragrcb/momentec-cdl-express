# Momentec CDL Express

A standalone Next.js app for **Momentec Brands** (parent of Augusta Sportswear,
Holloway and other team-uniform brands — "outfitting moments that matter").
Customers upload artwork they already have (AI-generated or original), the app
reads the sport/garment/colors off it, matches it to a real Momentec/Augusta
catalogue style, previews it in 3D on the real garment mesh where available,
and records the request for artist review.

This is a **brand-new, fully standalone project** — it is not part of the
JourneyAX/Caroma-Poc monorepo, imports nothing from it at runtime, and has its
own `package.json` / `.git`. It sits alongside the sibling
`3d-garment-retexture` service and calls it over plain HTTP, treating it as a
black box.

```
JourneyAX/
  Caroma-Poc/                 (unrelated monorepo — not touched by this app)
  3d-garment-retexture/       (sibling service, its own repo — not modified)
  momentec-cdl-express/       (this project)
```

## What's real vs. what's a stub

- **Submit My AI Design** — fully built: upload → AI read → style match → 3D
  preview (where available) → comments → submit. This is the flow verified
  end-to-end below.
- **Start My AI Design** (generate a concept from scratch) — a placeholder
  landing stub only, as scoped. Not built.
- **3D preview** only exists for 4 catalogue styles that ship with a real
  `.glb` mesh in `assets/meshes/` (**228108, 228103, 228187, 227132**). Every
  other one of the 364 catalogue styles can still be identified and matched by
  name — the UI says so honestly and still records the request.
- **Submit** writes a local JSON record under `data/requests/` shaped like
  what a real COMS integration would eventually receive. There is no live
  COMS connection — the UI says so explicitly on the success screen.
- No real Momentec logo file was available, so the header uses a clean,
  text-based wordmark in their black/white house style rather than a
  fabricated logo asset.

## What was copied vs. built new

**Copied (read-only, not imported as code):**
- `data/template-library.json` — the real 364-style Augusta/Holloway
  catalogue, copied verbatim from
  `Caroma-Poc/journeyAX/data/cdl/template-library.json`.
- `assets/meshes/{228108,228103,228187,227132}.glb` — the 4 real garment
  meshes, copied from `Caroma-Poc/3d-garment-retexture/{models,samples}/`.

**Built new, standalone:** everything else — all app code, the matching
algorithm, the upload/analyze/bake/submit API routes, the three.js viewer, and
all UI/copy (re-branded for Momentec, structurally inspired by
[the client's AI Creator reference page](https://preview.pixelnovasolutions.com/aicreator/m-custom-ai-creator-page.html)
but not copied from it).

## Folder structure

```
momentec-cdl-express/
  app/
    page.tsx                       landing page (dual CTA hero)
    design/page.tsx                the 5-step wizard (client component)
    globals.css                    Momentec black/white design system
    api/
      upload/route.ts              POST - saves front/back/left/right images
      uploads/[sessionId]/[filename]/route.ts   GET - streams an uploaded image back
      analyze/route.ts             POST - Gemini vision read of the front image
      match-style/route.ts         POST - scores the catalogue against the read
      bake/route.ts                POST - starts a bake on the sibling service
      bake/status/route.ts         GET  - polls a bake job's status
      bake/[jobId]/file/[name]/route.ts   GET - proxies one output file (e.g. the GLB)
      submit/route.ts              POST - persists the final mockup request
  components/
    Wordmark.tsx                   text-based Momentec wordmark
    ThreeViewer.tsx                three.js GLB viewer (own implementation)
  lib/
    types.ts                       shared types
    catalogue.ts                   loads template-library.json, scores matches
    gemini.ts                      Gemini vision call + prompt
    retexture-client.ts            HTTP client for the sibling retexture service
    store.ts                       JSON-file persistence for submitted requests
  assets/meshes/                   the 4 copied .glb files
  data/
    template-library.json          the copied catalogue
    requests/                      submitted mockup requests land here (gitignored)
    uploads/                       customer-uploaded images land here (gitignored, private - not under public/)
```

## Running it

You need **two** processes running: this app, and the sibling
`3d-garment-retexture` service it calls over HTTP.

### 1. The sibling retexture service

```bash
cd ../3d-garment-retexture
npm install && npm run setup      # first time only
cp .env.example .env              # required even if you leave it empty
npm start                         # http://localhost:3000
```

`GEMINI_API_KEY` in **that** service's `.env` is only needed for generated
back/side views, which this app does not currently request (it always bakes
in "match this garment" mode, front only, so it works without that key).

### 2. This app

```bash
npm install
cp .env.example .env
# set GEMINI_API_KEY in .env for real AI analysis of uploaded artwork
# (RETEXTURE_SERVICE_URL defaults to http://localhost:3000, correct out of the box)
npm run dev                       # http://localhost:3200
```

Runs on **:3200** deliberately, so it never collides with the sibling
service's default **:3000**.

### Environment variables (this app's `.env`)

| Key | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | `/api/analyze` (AI read of uploaded artwork) | Without it, analyze returns an honest "AI analysis is unavailable" placeholder with empty fields you fill in yourself — the rest of the flow still works. Get one from https://aistudio.google.com/apikey |
| `RETEXTURE_SERVICE_URL` | `/api/bake`, `/api/bake/status`, GLB proxy | Defaults to `http://localhost:3000`. |

## The sibling service's real API contract (as integrated against)

Read directly from its `server.js` / `pipeline.js`, not assumed:

| Route | Contract |
|---|---|
| `POST /api/jobs` | multipart form: `glb`, `reference` files, plus `mode` (`match`\|`transfer`), `gemini` (`'true'`\|`'false'`), `views`, `tier`, `size`, `colors`, `keep`, `backText`. Returns `202 { id }`. |
| `GET /api/jobs/:id` | `{ id, status: queued\|running\|done\|failed, stage: prep\|render\|views\|bake\|null, error, stats, log[], files: string[] }`. Poll this. |
| `GET /api/jobs/:id/files/:name` | Raw bytes of one output file. `"glb"` is the baked model's file label once `status === "done"`. |

This app's `lib/retexture-client.ts` always sends `mode=match, gemini=false` —
it projects the customer's own uploaded front image directly onto the mesh's
front panel, which needs no Gemini call on the retexture service's side.

## Verification status (honest)

**Verified working, end-to-end, in a real browser, with both services actually running:**

1. Uploaded `3d-garment-retexture/samples/momentec_motocross_jersey_mockup.png`
   through the real upload UI.
2. `/api/analyze` correctly reported the AI-unavailable fallback (no
   `GEMINI_API_KEY` was available in this environment — see below) with
   editable fields.
3. Manually entered "Hockey" / "Jersey" and confirmed `/api/match-style`
   correctly ranked **228103** (a real hockey jersey, one of the 4
   mesh-available styles) at the top of 8 candidates, scored against all 364
   catalogue rows.
4. Selected 228103, which triggered `/api/bake` → a real call to the sibling
   service's `POST /api/jobs` → polled `/api/bake/status` through
   `queued → running (prep → bake) → done` → the baked GLB streamed back
   through `/api/bake/[jobId]/file/glb` and rendered live in the three.js
   viewer, visibly showing the uploaded design's colors and lettering
   ("RINK RIPPERS") baked onto the real jersey mesh. Reported silhouette fit
   was 0.866 ("good").
5. Added a comment and submitted; the record persisted correctly to
   `data/requests/<id>.json` with the image path, analysis, chosen style, and
   bake result.

**Blocked / not verified:**

- **Real AI analysis** (`/api/analyze` actually calling Gemini) — this
  environment has no `GEMINI_API_KEY` available anywhere (neither this app's
  `.env` nor the sibling service's), so only the honest fallback path was
  exercised, not a live Gemini vision call. Set `GEMINI_API_KEY` in this app's
  `.env` to verify that path.
- The sibling `3d-garment-retexture/.env` did not exist in this environment
  and was created from `.env.example` (with an empty `GEMINI_API_KEY`) so the
  service would boot at all — its generated back/side views feature is
  therefore unverified too, but this app's flow never requests them anyway.
- Styles without a mesh (i.e. 360 of the 364 catalogue entries) were not
  exercised through the "3D preview isn't available yet" path in this pass,
  though the code path is a simple conditional in `app/design/page.tsx` and
  `app/api/bake/route.ts` (`hasMesh()` check) and was reviewed, not just
  assumed.

**A real bug found and fixed during verification:** `next start` (production
build) was not serving files added to `public/` after the build completed —
static requests for such files 404'd even though they existed on disk on a
locally running server (confirmed with a plain `curl` test on an unrelated
test file). Rather than fight that, uploaded images now live in a private
`data/uploads/` directory and are streamed back through a dedicated
`GET /api/uploads/[sessionId]/[filename]` route instead of Next's static
`public/` serving — which is also the more correct architecture for
user-uploaded content regardless of the bug.

## Build

```bash
npm run typecheck   # tsc --noEmit - passes clean
npm run build       # next build - passes clean
```
