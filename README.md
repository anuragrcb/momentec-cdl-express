# Momentec CDL Express

> Deployment: see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for private Blob storage, Magnific MCP configuration, limits and verification.

A standalone Next.js app for **Momentec Brands** (parent of Augusta Sportswear,
Holloway and other team-uniform brands — "outfitting moments that matter").
Customers upload artwork they already have (AI-generated or original), the app
reads the sport/garment/colors off it, matches it to a real Momentec/Augusta
catalogue style, previews it in 3D on the real garment mesh where available,
and records the request for artist review.

This is a **brand-new, fully standalone project** — it is not part of the
JourneyAX/Caroma-Poc monorepo and imports nothing from it at runtime, and has
its own `package.json` / `.git`. It calls the **actively-developed**
`3d-garment-retexture` service that lives inside `Caroma-Poc/` over plain
HTTP, treating it as a black box.

```
JourneyAX/
  Caroma-Poc/
    3d-garment-retexture/     (the REAL sibling service this app calls — its
                                own repo, its own .env, not modified by this app)
    ...                       (rest of the monorepo — unrelated, not touched)
  3d-garment-retexture/       (a STALE, untouched-since-Aug-13 snapshot — do
                                NOT point this app at it; kept only for
                                historical reference, has a materially
                                different/older /api/jobs contract)
  momentec-cdl-express/       (this project)
```

**Important:** an earlier pass of this app was wired to the wrong copy (the
stale top-level `3d-garment-retexture/`). It has since been repointed at the
real, actively-developed copy under `Caroma-Poc/3d-garment-retexture/`, whose
`/api/jobs` contract is richer — it accepts optional `backImg`/`leftImg`/
`rightImg` multipart fields (this app already collects those in step 1 and now
sends them along), and supports a `mode=augusta` value in addition to
`match`/`transfer` (not used by this app — see below).

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
  meshes, copied from `Caroma-Poc/3d-garment-retexture/{models,samples}/`
  (228108 and 228103 from `models/`, 228187 and 227132 from `samples/` — that
  project doesn't keep all four in the same folder). Re-verified byte-for-byte
  identical (sha256) against that source on the latest pass, then re-copied
  anyway for provenance.

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
`3d-garment-retexture` service it calls over HTTP — **the real one, at
`Caroma-Poc/3d-garment-retexture`**, not the stale top-level copy.

### 1. The sibling retexture service

```bash
cd ../Caroma-Poc/3d-garment-retexture
npm install                       # first time only
# .env already exists in that project with PORT=4000 and its own API keys —
# do not overwrite it; it's a live, actively-developed project, not a template.
npm start                         # http://localhost:4000
```

`GEMINI_API_KEY` in **that** service's `.env` is only needed for
Gemini-*synthesized* views (a back/left/right view neither uploaded manually
nor supplied on disk). This app now always sends its own manually-captured
back/left/right images when the customer provided them in step 1, so they get
baked without needing that key at all — only the front-only fallback path (no
back/left/right uploaded) is fully key-independent by design.

### 2. This app

```bash
npm install
cp .env.example .env
# set GEMINI_API_KEY in .env for real AI analysis of uploaded artwork
# (RETEXTURE_SERVICE_URL defaults to http://localhost:4000, correct out of the box —
#  matching the real sibling service's own configured PORT=4000)
npm run dev                       # http://localhost:3200
```

Runs on **:3200** deliberately, so it never collides with the sibling
service's own **:4000**.

### Environment variables (this app's `.env`)

| Key | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | `/api/analyze` (AI read of uploaded artwork) | Without it, analyze returns an honest "AI analysis is unavailable" placeholder with empty fields you fill in yourself — the rest of the flow still works. Get one from https://aistudio.google.com/apikey |
| `RETEXTURE_SERVICE_URL` | `/api/bake`, `/api/bake/status`, GLB proxy | Defaults to `http://localhost:4000`, matching `Caroma-Poc/3d-garment-retexture`'s own `.env` (`PORT=4000`). |

## The sibling service's real API contract (as integrated against)

Read directly from `Caroma-Poc/3d-garment-retexture`'s current `server.js` /
`pipeline.js` (its API has diverged from the stale top-level copy — do not
assume that one's contract still applies):

| Route | Contract |
|---|---|
| `POST /api/jobs` | multipart form: `glb`, `reference` files (required), plus optional `backImg`, `leftImg`, `rightImg` files, plus `mode` (`match`\|`transfer`\|`augusta`), `gemini` (`'true'`\|`'false'`), `views`, `tier`, `size`, `colors`, `keep`, `backText`. Returns `202 { id }`. |
| `GET /api/jobs/:id` | `{ id, status: queued\|running\|done\|failed, stage, error, stats, log[], files: string[] }`. Poll this. |
| `GET /api/jobs/:id/files/:name` | Raw bytes of one output file. `"glb"` is the baked model's file label once `status === "done"`. |

This app's `lib/retexture-client.ts` always sends `mode=match, gemini=false` —
it projects the customer's own uploaded front (and, when supplied, back/left/
right) images directly onto the mesh, which needs no Gemini call on the
retexture service's side. `backImg`/`leftImg`/`rightImg` are prepped
(background-cut) and baked into the atlas unconditionally in `match` mode —
they don't require `gemini=true`; that flag only controls *synthesizing* a
view that wasn't supplied at all.

**`mode=augusta` was deliberately not adopted here.** It runs a completely
different pipeline on the retexture service's side — it classifies the
reference image's construction (sport/neckline/sleeves) with an LLM, matches
it against Augusta's own style registry, and picks the GLB model *for you*
from that registry, discarding the uploaded `glb`. This app already does its
own style matching against a separate 364-style catalogue
(`data/template-library.json` via `/api/match-style`) and already knows which
SKU (and therefore which local mesh) it wants baked — running Augusta's
classifier/matcher again on top would just contradict this app's own match
step. `match` mode is the correct fit; the richer part of `augusta` mode this
app *does* benefit from is the multi-image (`backImg`/`leftImg`/`rightImg`)
support, which is shared plumbing available in `match` mode too and is now
wired through.

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
