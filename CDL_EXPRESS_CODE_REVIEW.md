# Momentec CDL Express — Technical Code Review

**Review scope:** The standalone Next.js repository at `momentec-cdl-express`, its dependency on `Caroma-Poc/3d-garment-retexture`, the supplied Super Custom/CDL meeting requirements, and the recorded front/back browser-test notes.  
**Review date:** August 27, 2026  
**Review position:** The current implementation is a promising **prototype** with a real upload-to-GLB preview path. It is not yet ready to be described as a reliable production Super Custom/CDL flow.

---

## Executive conclusion

The product direction is correct. The current flow is intentionally simple: upload artwork, prepare it, identify a style, show a 3D approximation, accept minimal notes, and hand the package to an artist. That is well aligned with the meeting decision that customers should not be forced through the legacy Builder just to create a mockup request.

The core prototype also contains meaningful real work. It accepts front/back/side images, calls a real artwork-preparation client, invokes a separate retexturing service for four meshes, supports a browser-side material-preview route for eight verified hockey GLBs, and writes a transparent local mockup record. `npm run typecheck` and `npm run build` both completed successfully during this review.

> **The main implementation problem is not the 3D viewer. The prepared customer artwork is currently not connected to analysis or to either 3D simulation path.** The customer sees a prepared image but the application later sends the original upload to the AI reader and to the mesh. Therefore Magnific preparation is presently a visual checkpoint, not part of the actual production data flow.

The second material issue is architectural. The code is correctly avoiding a one-SKU iframe, but the browser material-bake implementation still relies on a handful of asset-specific UV assumptions. It should become a per-SKU **asset manifest** with verified material and panel mappings before more styles are enabled.

| Area | Current status | Assessment |
|---|---|---|
| Customer journey shape | Implemented | Strong fit with the approved CDL Express objective |
| Upload of front/back/side images | Implemented | Prototype quality; requires limits, ownership controls, and durable storage |
| Magnific preparation | Implemented but disconnected | Must be connected to downstream analysis and rendering |
| Product/style selection | Implemented | Heuristic ranking; known style-number path is not deterministic enough |
| Server-generated GLB preview | Implemented for 4 styles | Works as a prototype; must clearly report quality and use prepared files |
| Browser-side GLB preview | Implemented for 8 verified hockey styles | Good experiment; needs a data-driven UV/material descriptor |
| COMS/mockup handoff | Local JSON only | Honest prototype stub; production integration remains unbuilt |
| Dynamic names/numbers | Free-text comments only | Required structured capture is missing |

---

## What is working and worth preserving

The implementation has several sound choices that should remain in the production design.

The upload endpoint isolates artwork outside `public/` and serves it through a constrained route. The paths are limited to the expected slots and image extensions, which avoids path traversal in the current local prototype. The route also establishes a session identifier so front, back, left, and right files travel together. See `app/api/upload/route.ts:8–40` and `app/api/uploads/[sessionId]/[filename]/route.ts:14–37`.

The Magnific integration follows a reasonable server-side pattern. The source file is first staged on Magnific storage, then background removal runs, and a precision/low-creativity upscale is attempted only when the long edge is below 1,500 pixels. The code immediately downloads short-lived result URLs and deliberately falls back to the original asset if preparation cannot run. This matches the business requirement to use Magnific behind the scenes without making artwork preparation a customer-side tool. See `lib/magnific.ts:303–374`.

The project correctly distinguishes two preview mechanisms instead of pretending all styles work the same way. `lib/retexture-client.ts:43–75` posts an uploaded GLB plus the front and optional back/left/right images to the sibling retexturing service. The newer browser route loads locally verified Augusta hockey GLBs and maps artwork directly into the material atlas. The code is also transparent that the browser implementation is not universal and has only been empirically verified for a limited set of styles. That honesty should be retained.

Finally, the UI does not falsely claim a COMS order was placed. The submit step says clearly that it is a local prototype record, and the associated API currently writes only a JSON record under `data/requests/`. See `app/design/page.tsx:602–615` and `app/api/submit/route.ts:7–26`.

---

## Priority findings

### P0 — Must correct before a customer demonstration

| Finding | Evidence | Why it matters | Required correction |
|---|---|---|---|
| **Prepared artwork is not used downstream.** | The preparation route writes `front-prepared.png` and returns `preparedUrl` (`app/api/prepare-artwork/route.ts:46–65`). The next step still posts `images.front.file` to `/api/analyze` (`app/design/page.tsx:134–151`). Both the server bake and browser material viewer receive `images.*.savedUrl`, which are original upload URLs (`app/design/page.tsx:196–208`, `520–528`). | A customer is told that their artwork was cleaned and upscaled, but the AI read and the 3D simulation use another image. This can visibly reduce quality and makes the process misleading. | Introduce one explicit `activeArtwork` object. After preparation, replace the active front/back/left/right references with the prepared URLs and local files. Both `/api/analyze` and `/api/bake` must consume those active assets. Run preparation for every uploaded view, not only `front`. |
| **The direct style-number route is not deterministic.** | `/api/match-style` calls `matchStyles(analysis, 8)` first, then moves a known SKU only if it happens to be among those eight results (`app/api/match-style/route.ts:14–25`). | A customer who types a correct style, such as `228108`, can fail to see it if the image classifier or keyword scorer ranks it outside the top eight. This directly contradicts the approved requirement that a customer may already know the style number. | Validate the typed SKU against the canonical product catalog first. If valid, show it as the selected style immediately, with optional alternatives below it. Do not use the AI ranking as a gatekeeper. |
| **The local `/design` route currently returns HTTP 500.** | During review, `GET /` returned `200`, but `GET /design?mode=submit` returned `500` with `Cannot find module './331.js'` from `.next/server/webpack-runtime.js`. | The wizard cannot be reliably demonstrated in its current local development state. The error looks like a stale/corrupted Next development build chunk rather than a TypeScript compilation error because a fresh typecheck and production build both passed. | Stop the existing development process, delete only `.next/`, and start the development server again. Re-test `/design` before further browser work. Do not change product code until this cache recovery has been verified. |

### P1 — Correct in the next implementation increment

| Finding | Evidence | Why it matters | Required correction |
|---|---|---|---|
| **3D availability is presented inconsistently.** | There are four SKUs in `MESH_AVAILABLE_SKUS` but eight verified browser-side SKUs in `AUGUSTA_LIVE_GLB_SKUS` (`lib/types.ts:56–92`). Matching uses only `hasMesh`, so a style with a browser-side GLB is labelled “No 3D preview yet” even though `app/design/page.tsx:520–537` will render it after selection. | Customers receive an incorrect capability signal. The matcher also favours the four older server-bake meshes over the newer eight browser meshes. | Replace the two competing lists with one `styleAssetDescriptor` dataset that stores `previewMode`, `modelUrl`, `normalMapUrl`, verified material map, and preview readiness. Calculate all UI labels and matching capabilities from that dataset. |
| **Artwork source type is not captured.** | The dependent service runs `mode=match` with `gemini=false` (`lib/retexture-client.ts:60–68`). This projects uploaded garment-shaped imagery to a mesh. | The meeting requirement permits a customer to upload a design they already own. That may be a flat front panel, a garment mockup, a seamless pattern, or a logo sheet. These are not interchangeable inputs. An arbitrary concept image cannot be projected accurately just because it is called “front.” | Ask one minimal source question: **“Is this a garment mockup, a flat front/back artwork panel, or separate logo/pattern assets?”** Route the source to the appropriate simulation strategy and show the preview confidence. |
| **The browser-side UV mapping has unverified assumptions.** | `components/AugustaMaterialBake.tsx` contains a large runtime heuristic for torso/sleeve island detection. Its own comments state left/right sleeve assignment is a best-effort guess and only specific orientation cases have been visually verified (`lines 253–265`, `33–35`). | A false-looking preview is worse than no preview because it can cause customer approval of a placement the artist cannot reproduce. The `228108` rotate-180 special case demonstrates that this must be per asset. | Generate and store a verified asset manifest per SKU. It should explicitly map `frontTorso`, `backTorso`, `leftSleeve`, `rightSleeve`, collar/yoke regions, UV transforms, and normal map metadata. Runtime code should interpret the manifest, not infer every panel from geometry at customer interaction time. |
| **The customer’s uploaded back and side images are not prepared.** | Step 1 prepares only `{ sessionId, slot: "front" }` (`app/design/page.tsx:118–126`). | The test notes refer to a useful back image containing “MARNER / 93.” That asset is exactly the kind of image that needs cleanup before it goes to the back panel. | Prepare all supplied images in parallel after upload. Surface their individual success/fallback status without adding customer friction. |
| **The artist handoff lacks structured dynamic-element data.** | The UI only has a free-text `comments` field (`app/design/page.tsx:585–599`). The request payload has no dynamic fields (`lib/types.ts:138–161`). | The approved flow specifically calls out “23 is dynamic” and “Player name will change.” A comment alone is not enough for reliable artist/COMS processing. | Add a small, optional **Dynamic elements** form after simulation: element type, current value, location/view, and intended behavior. Preserve the customer’s language as the original instruction too. |
| **The handoff does not preserve the complete artwork package.** | Submit persists images, basic analysis, chosen style, bake status, and comments only (`app/api/submit/route.ts:16–23`). | Operations needs originals, prepared versions, analysis revision, selected product asset version, preview image/GLB, per-view fit status, dynamic fields, and processing audit trail. | Define a versioned `MockupRequestPayload` and map it to COMS only from the backend. Persist original/prepared asset IDs, checksums, versions, per-view statuses, consent, and final preview artifacts. |

### P2 — Hardening and maintainability work

The upload route validates the client-provided MIME type but not the file signature, dimensions, pixel count, total session size, or file size. It has no application-level rate limit and stores content on local disk. For a multi-instance or production deployment, use authenticated object storage with time-limited signed URLs, malware scanning, maximum pixel/file limits, automatic retention, and an ownership check on every retrieval endpoint.

Session IDs are short random values and the uploaded-file/prepare endpoints have no user or session authorization. This is acceptable for a local proof of concept, but it is not a private customer-artwork design. Add customer/session identity before production and do not expose asset URLs that can be guessed or shared indefinitely.

The submit API trusts UI-provided `analysis`, `chosenStyle`, `images`, and `bake` fields. A production BFF should resolve the SKU from the authorized server-side session and validate it against the canonical catalog before creating a COMS request. It should never accept the selected style as an arbitrary client object.

The raw Three.js viewers clean up controls and the renderer, but they do not dispose every geometry, material, texture, or canvas texture created during a preview. Repeated navigation or rebake actions can therefore grow GPU memory use. Refactor disposal into a shared helper, or use a React Three Fiber implementation with explicit lifecycle handling. This is not a blocker for the first demonstration but is important before opening the workflow to customer traffic.

The declared `npm run lint` command launches the deprecated interactive `next lint` setup and exits unsuccessfully when no ESLint configuration is present. It cannot be used in CI as written. Migrate to an explicit ESLint configuration and a non-interactive `eslint .` script. `git diff --check` completed with no whitespace errors during this review.

---

## Correct 3D architecture for this use case

The desired implementation is **not** a generic “put any image on any 3D jersey” function. It is an apparel simulation service that must know the product asset, its materials, its UV regions, and the customer’s artwork source type.

For apparel, retain the no-iframe approach: load the selected SKU’s GLB/OBJ from the appropriate mesh library, obtain the prepared artwork assets through the secure BFF, compose a texture atlas using the selected SKU’s descriptor, and apply it to the model in the Three.js scene. This is broadly the direction of the current code, but it must evolve from runtime guesses to verified metadata.

| Concern | Recommended source of truth | Current gap |
|---|---|---|
| Selected product/style | Canonical Momentec/Augusta product catalog | Local copied catalogue plus name-keyword scoring |
| Whether preview is available | Versioned SKU asset descriptor | Two separate hard-coded SKU lists |
| Apparel mesh | Approved GLB/OBJ/normal-map record per SKU | Local asset folders; no central descriptor/version |
| Front/back/sleeve placement | Per-SKU material + UV island manifest | Browser component infers placements at runtime |
| Customer artwork input | Secure session asset record with source type | Original and prepared assets are disconnected |
| Predefined design-line previews | Live per-SKU Scene7 attribute/schema response | Not used in this app, which is acceptable for super-custom art |
| Cap/headwear preview | Separate cap GLTF mesh-color/decoration pipeline | Must not be forced through the apparel material route |

> **Important Scene7 boundary:** Augusta Scene7 design-line variables are product- and design-line-specific. A generic variable such as `SUB_FIRST_BODY_COLOR` must never be assumed to bind a customer’s uploaded super-custom image. Use the live Scene7 schema only for the applicable predefined design-line preview. Use the verified garment mesh plus the customer-artwork texture workflow for the Super Custom path.

Headwear remains a separate implementation family. It uses cap GLTF models, per-mesh color JSON, and decoration textures; it should be offered only when its own cap descriptor and preview pipeline are implemented. It should not share the apparel UV-atlas code merely because it is a Momentec product.

---

## Recommended target flow

The following sequence meets the meeting requirement while remaining simple for the customer.

| Step | Customer experience | System work |
|---|---|---|
| 1. Upload | Upload front and optional back/sides; select source type; enter a known style number if available. | Create an authenticated submission session; validate and store files privately. |
| 2. Prepare | Show a short “Preparing artwork” step with an honest fallback state. | Prepare every supplied view through Magnific; make prepared asset IDs the active artwork. |
| 3. Understand | Show an editable short read: sport, garment type, colors, text/logo/number. | Analyse active artwork across all supplied views; store structured confidence and source references. |
| 4. Select style | If the customer entered a valid SKU, show it immediately; otherwise show ranked alternatives. | Resolve SKU from canonical data and retrieve its asset descriptor. |
| 5. Simulate | Show a labelled **visual simulation for review**, not a production proof. | Select the correct apparel or headwear renderer; apply prepared artwork to verified regions; return per-view confidence. |
| 6. Minimal corrections | Capture only concise comments plus optional dynamic tags such as player name/number. | Persist structured dynamic-element records. |
| 7. Submit | Customer sees a submission receipt. | Create a COMS mockup request carrying all original/prepared assets, style metadata, simulation artifacts, and audit fields. |
| 8. Artist handoff | No extra customer action. | Artist receives the complete package and remains responsible for Illustrator, cut-piece, placement, font, and production validation. |

---

## Implementation sequence

### Increment 1 — Make the current prototype truthful and demonstrable

First, repair the local Next development cache issue and confirm `/design` loads. Then create an `activeArtwork` session state and wire prepared front/back/left/right assets into analysis, browser-side material baking, and the server-bake request. Fix the direct known-SKU path so `228108` and any valid catalog SKU can be selected deterministically. Finally, derive the “3D preview available” label from one capability record rather than from the older four-SKU list.

### Increment 2 — Make apparel rendering data-driven

Create a `product-assets` descriptor for each enabled apparel SKU. Each record should identify the original model source, mesh/model version, material names, UV regions, normal-map details, rotation/mirroring adjustments, and test status. Port the current valid `228103` and `228108` findings into descriptors rather than expanding additional runtime heuristics. Add only a SKU after a labelled front/back/left/right placement test passes.

### Increment 3 — Create the production handoff contract

Add an authenticated submission session and a versioned COMS mapping layer. Include original and prepared artwork, style/SKU, source type, analysis data, dynamic fields, simulation preview/screenshot, quality indicators, and customer comments. Use durable private object storage instead of local project disk. Keep Magnific and all operational integrations behind server routes.

### Increment 4 — Expand safely by product family

Enable more apparel styles through the asset descriptor. Build the cap/headwear pipeline separately, based on cap GLTF mesh colors and decoration zones. Use Scene7 only where a predefined product/design-line schema supports the selected flow. Do not use a global color/layer rule across unrelated product styles.

---

## Test plan before the next stakeholder review

The second supplied note records a prior test with a front image containing a crest and the number **93**, plus a back image containing **MARNER / 93**. Those are excellent fixture characteristics because they reveal mirrored, upside-down, and wrong-panel mappings. The actual two image files were not attached in this task, so I reviewed the recorded test observations and source code rather than visually certifying the final rendered model.

| Test | Expected result | Pass condition |
|---|---|---|
| Known style `228108` + front/back labelled fixtures | Style appears immediately without ranking dependency. | The user can continue to simulation after SKU validation. |
| Magnific traceability | Prepared front and prepared back are the active assets. | API payload/record includes prepared asset IDs and hashes; 3D output visibly follows prepared image. |
| Front mapping | Crest and `93` appear on the front, readable and correctly placed. | No horizontal/vertical mirror; no unexplained crop. |
| Back mapping | `MARNER` and `93` appear on the back, readable and upright. | No front bleed; no 180° rotation unless descriptor specifies and test passes. |
| Sleeves | Distinct left/right markers appear on the intended physical sleeves. | Mapping is verified per enabled SKU, not inferred. |
| Missing back asset | Front renders; back is clearly shown as an approximation or neutral state. | No claim that the customer supplied or approved a back design. |
| Unsupported SKU | The request remains valid for artist review. | UI says simulation is unavailable for the selected style; no broken or generic garment shown. |
| Submit payload | Artist package contains all required references. | Original/prepared assets, selected SKU, dynamic instructions, and preview record are present. |

---

## Review evidence

| Evidence | Outcome |
|---|---|
| `npm run typecheck` | Passed |
| `npm run build` | Passed; Next generated 12 routes/pages |
| `npm run lint` | Not usable as a check: deprecated interactive setup opened and exited with status 1 because ESLint is not configured |
| `git diff --check` | No whitespace errors reported |
| Local `GET /` | HTTP 200 |
| Local `GET /design?mode=submit` | HTTP 500 from stale/missing Next build chunk `./331.js` |
| Dependent retexture service at `:4000` | HTTP 200 at review time |
| Supplied meeting notes | Confirmed the intended customer-first, artist-in-the-loop business flow |
| Supplied browser test notes | Confirmed front/back fixture intent, but not a completed, visually verified final 3D result |

---

## Bottom line

The implementation is moving in the right direction and has a better foundation than a static mockup. It already proves that a customer design can reach a real garment GLB and that the app can remain separate from the traditional Builder.

The immediate focus should be **data continuity and truthfulness**: the exact prepared assets shown to the customer must be the ones analysed, rendered, and sent to the artist; a known SKU must always select the known SKU; and each enabled 3D style must carry verified mapping metadata. Once those are corrected, the workflow will be a credible CDL Express demonstration rather than a promising technical prototype.
