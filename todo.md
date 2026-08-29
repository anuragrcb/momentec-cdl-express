# CDL Express Apparel Implementation Checklist

- [x] Confirm the live Momentec 228108 configurator renderer, assets, and cut-piece behavior.
- [x] Establish one SKU asset descriptor for model, material, SVG/cut-piece, and preview capability data.
- [x] Connect prepared front/back/left/right artwork to analysis and 3D rendering.
- [x] Generate missing garment views only when the customer did not upload them.
- [x] Implement an enabled 228108 apparel preview that follows its verified material/UV mapping.
- [x] Capture approval plus structured logos, fonts, positions, and dynamic-element instructions for handoff.
- [x] Validate the intake-to-preview flow and document the exact supported and fallback behavior.

## Live 228108 Renderer Observations

The live Momentec `Configurator?partNumber=228108` identifies the product as the FreeStyle Performance Series Pro V-Neck Hockey Jersey, style 228108. Its supplied `render3d.js` is a Three.js renderer that takes a forward and reverse image, uses explicit front/back/left/right camera angles, supports GLTF and OBJ paths, and treats materials named `reverse` as distinct from customer-facing materials. It sets `texture.flipY = false` for GLTF and has separate overlay behaviour for decorations. These observed behaviours will guide, but not be copied into, the standalone data-driven implementation.

The live renderer builds the apparel mesh path as `window.baseCdnUrl + "3D-Sublimation/" + styleNumber + "/"`, then loads `{styleNumber}.glb` and `{styleNumber}-NormalMap.png` in its GLTF branch. The standalone 228108 descriptor will therefore retain an explicit GLB path, normal map path, forward/reverse artwork roles, and deterministic camera positions rather than treating all garments as a shared generic texture map.

## Local Validation Observation

The local `GET /design?mode=submit` route was recovered by clearing the stale `.next` cache and restarting the development process; it now returns HTTP 200 and displays the four artwork slots plus the known-style-number input. A browser upload attempt against a sibling-project fixture did not start because that local path is not available to the browser upload bridge. The next validation run will use a fixture copied into the accessible project path or the customer-provided front/back images when attached.

The browser validation resumed using a non-sensitive 228108 apparel render fixture copied into the upload bridge. The front upload succeeded and the known style `228108` was entered. The intake button correctly moved into its processing state. The next check is whether upload/preparation completes and the valid known style remains available independently of image analysis.

The repaired flow completed the upload and Magnific preparation request. The test fixture was a 228108 cut-piece reference rather than customer artwork, so background removal created a visually unsuitable dark result despite the successful response. This is expected for the chosen non-customer fixture and does not invalidate the workflow; it confirms that generated/prepared output is now visible in the step before the prepared asset becomes the active analysis and bake input.

The updated analysis endpoint completed using the prepared asset rather than a browser-resubmitted original file. With the deliberately non-representative cut-piece fixture, the AI summary correctly described it as an unpopulated jersey panel layout. Despite sparse sport data, the valid entered SKU `228108` was surfaced at the top of the results at score 100 and marked 3D preview available. This confirms the explicit known-style selection path is no longer gated by heuristic image matching.

The selected 228108 route successfully started a server-side bake on the verified hockey GLB. Because only a front fixture was uploaded, the request correctly entered the selected-model preprocessing stage and requested generated back/left/right views. The next status check will distinguish a completed model-aware generation/bake from an expected vision-service configuration failure.

The 228108 bake progressed through the generated-view stage and the sibling service reported that the model-aware right view was painted. This confirms the server did not reject the newly added missing-view request for lack of a vision-service key. The run remains in progress until the GLB atlas bake and viewer load complete.

The 228108 request reached the atlas stage and is baking four views: the customer-supplied front and the generated back, left, and right views. This is the intended Super Custom behavior for a front-only submission; the final check remains the retextured GLB load and visual simulation output.

The dependent retexturing service explicitly supports `mode=transfer`: it renders the selected GLB&apos;s front, back and required side silhouettes, uses Gemini to paint flat artwork onto those model renders, then bakes the views into the UV atlas. The CDL Express flow now selects this path for customer artwork classified or confirmed as flat artwork, while retaining direct `match` projection for jersey-shaped mockups.

The initial 228108 front-only validation completed all four generated/mapped views and loaded the retextured GLB in the browser. The fixture was intentionally a flat product cut-piece image, so its direct-projection fit scored only 3% and correctly displayed the service&apos;s placeholder warning rather than falsely claiming a credible customer preview. A later production build modified `.next` while the development server was live, which reintroduced a Next development-chunk error on fresh navigation. The clean restart procedure must be run after build validation and before browser testing.

The local development server was restarted from a clean cache and the flat-artwork transfer validation has begun with the verified 228108 model. The test fixture has been uploaded as the required front image and `228108` entered as the explicit known style. The remaining test will set the editable artwork source to flat artwork and verify the `transfer` route uses model-fit generation rather than the low-fit direct projection used in the first run.

The test fixture again completed Magnific preparation and is ready for the editable analysis-confirmation stage. Its dark prepared result is a property of using a white production cut-piece reference as a non-sensitive test fixture; it will not be used as a quality benchmark for a customer-supplied design. The test is solely confirming that flat artwork invokes the correct selected-model transfer route.

The AI read classified the selected fixture as a blank flat sewing-pattern layout, and the customer-facing source selector exposes that classification as **Flat artwork, panel layout, logo, or pattern**. This is the required distinction that allows the customer to correct the AI before the system chooses transfer rather than direct mockup projection.

The flat-artwork classification is selected in the browser and the verified known style `228108` remains the top, selected 3D-capable option. The next action will start the bake in `transfer` mode so the model renders the front and missing views before artwork is painted and converted into the GLB atlas.

The model-selection screen correctly requires an explicit style selection before continuation. The selected `228108` row is now active; the next validation action will launch the resulting `transfer` bake. This ensures a valid known SKU is surfaced automatically but still gives the customer the final product-selection control.

The selected 228108 transfer bake has started and is in the server preparation stage. Its job input is the flat-artwork route, so the dependent service will render the selected 228108 GLB&apos;s own front plus missing back/left/right silhouettes before painting and baking the customer design, rather than directly projecting the flat cut-piece fixture.

The flat-artwork transfer job entered its model-render view stage and reported that the right view was painted over the selected 228108 model&apos;s own render. This distinguishes the current run from the earlier direct-projection run. The final check is completion of the four-view UV bake and load of the retextured GLB into the customer viewer.

The 228108 transfer job reached the UV-atlas bake stage, combining the model-fit front plus generated missing views. It remains in progress at this stage; the next check will use the dependent service job information if the customer screen has not yet advanced.

The `transfer` validation job completed with a 2048×2048 atlas, 91.5% coverage and a service verdict of `usable`; the browser loaded its retextured 228108 GLB. The preceding direct-projection run ended with the expected poor-quality verdict for the flat fixture, proving the new source classification changes the actual renderer path. The approved-artwork extraction endpoint also returned a structured response and its result appeared in the customer&apos;s final submission step. It correctly reported no customer logos, numbers, or typography for this blank pattern fixture. The final **Submit for artist review** button was not pressed because it creates a persisted mockup request; the present POC sends that JSON to its local request store, not a live order/COMS backend.

## Actual Hockey Design Validation

- [x] Copy the supplied front and back hockey images into the browser-accessible test area without modifying the source files.
- [x] Run the actual images through a hockey-model 3D bake.
- [x] Inspect the baked 3D output for crest, front number, player name, back number, sleeve marks, and pattern continuity.
- [ ] Confirm the selected style is 228108 rather than the incompatible 228150 reversible model.
- [x] Derive and validate an explicit 228108 front/body/back/left-sleeve/right-sleeve panel map from its SVG and GLB UVs.
- [ ] Restrict broad customer views to their matching 228108 panel/UV islands and re-render the supplied design.
- [ ] Re-render the actual front/back assets and inspect every displayed view before reporting the corrected output.

## Correct Lace-Up Model Selection

- [x] Compare the customer source’s physical construction against the local Augusta hockey catalogue.
- [ ] Replace the 228108/228150 assumption with 228103 in the customer selection and test flow for lace-up artwork.
- [ ] Extract the 228103 mesh-material and cut-piece/UV mapping data before any final artwork placement claim.
- [ ] Re-run the supplied front/back design on 228103 and assess front, back, both sleeves, collar, and side seams.

## 228103 Projection Failure — Customer Re-Test

- [x] Confirm that the customer flow now chooses 228103, the correct Traditional Lace Up Hockey Jersey silhouette.
- [x] Record the remaining visual defect from the customer re-test: generic projection enlarges the front crest across the black chest band and lace panel; it does not preserve isolated sleeve artwork.
- [ ] Stop using whole-garment camera projections as the final placement method for 228103 customer artwork.
- [ ] Create a versioned 228103 cut-piece compositor that writes separate front-body, back-body, left-sleeve, right-sleeve, yoke/collar, and cuff/trim regions to the atlas.
- [ ] Preserve the front crest only inside the front-body safe area; preserve `MARNER / 93` only inside the back-body safe area; place `9` and `3` only in their respective physical sleeve safe areas.
- [ ] Replace the current 228103 preview path with the compositor and review the rendered front, left, right, rear, and three-quarter views.

## Rejected Integrated Proof `2e3dfe3a`

- [x] Accept the customer&apos;s rejection: the proof has a clipped/distorted crest, incorrect back hierarchy, oversized/misaligned sleeve numbers, and broken trim continuity.
- [x] Remove `228103-traditional-lace-up-panel-v1` from the active customer bake path.
- [x] Prevent **Approve preview** whenever a 228103 proof is unavailable, failed, experimental, or not rated `good`/`usable` by a supported renderer path.
- [x] Show the supplied front/back artwork separately from the plain selected 3D model while an exact proof is unavailable.
- [ ] Do not re-enable 228103 3D approval until a template-driven output passes front crest, `MARNER / 93`, full `93` on both sleeves, lace/collar, trim continuity, and seam placement together.

The rejected job remains only as a diagnostic record. The live CDL app no longer sends the versioned experimental compositor flag, and the active retexturing service no longer contains that compositor branch. Style 228103 is intentionally marked unavailable for artwork approval: the page shows its genuine plain GLB construction plus the supplied front/back images, and disables the approval button. The service still contains the hard guard that fails a job when a required generated view is missing. A clean Next production build succeeds, the required `"use client"` directive is restored, and `GET /design?mode=submit` returns HTTP 200 after restart.

## Fresh End-to-End Guarded-Flow Test

- [x] Confirm the CDL app on port 3200 and retexturing service on port 4000 are healthy.
- [x] Upload the real hockey front and back files through a fresh browser session and a separate API session.
- [x] Verify preparation and joint front/back analysis, including sport, garment type, artwork kind, `MARNER / 93`, and sleeve marks.
- [x] Verify the known lace-up style resolves to 228103 and is selected rather than 228108/228150.
- [x] Verify the preview shows only the genuine plain 228103 model plus supplied references, labels mapping unavailable, and does not start the rejected compositor.
- [x] Verify the approval action is disabled and no artist/COMS package can be created from an invalid 3D proof.
- [x] Record the exact passing and failing behavior for the user.

Fresh API session `f2b0b224` and the separate browser session both passed upload and front/back preparation. Each source was background-removed; the browser run also precision-upscaled 1200×1200 inputs to 2400×2400. Joint analysis returned **Hockey**, **Jersey**, **garment mockup**, blue/black/white/cyan, front crest, `MARNER`, back number `93`, and sleeve marks `93` on both sides. The entered style `228103` appears first at score 100 and is preselected; 228150 and 228108 remain alternatives below it and are not silently selected. A direct 228103 bake request returns HTTP 400 before creating a job because verified artwork mapping is unavailable. In the browser preview, the DOM contains the plain 228103 canvas, supplied artwork images, the explicit disabled-mapping notice, and `<button disabled>` on the approval action. The app log confirms the browser path called upload, preparation, analysis, and style matching but **did not call `/api/bake`**.

## J180A Production-Asset Redesign

- [x] Remove the background-removal and artwork-preparation step from the customer journey; analyze the original uploaded files directly.
- [x] Extend analysis across every supplied view and return region-level detections with source view, normalized bounding box, semantic type, visible value, confidence, and placement description.
- [x] Build a deterministic Python extraction utility that creates PNG crops and conservative alpha masks for detected logos, wordmarks, names, numbers, sleeve marks, and other discrete artwork elements.
- [x] Persist extracted PNG assets privately and display them as clearly labelled boxes beside the analysis, including front/back/left/right placement values.
- [x] Inspect the authoritative J180A configurator and the supplied `J180A_S.glb`, `J180A_L.glb`, `J180A.glb`, and `prod-J180A-decorations.svg` assets.
- [x] Reveal and inventory hidden SVG groups, IDs, dimensions, transforms, clipping paths, decorations, and production-panel relationships without changing the upstream source.
- [x] Determine the J180A size-specific mesh and stable UV/material contract, including the separate live preview-SVG hit-test layer and production decoration SVG.
- [x] Use the supplied black/purple/gold baseball design as the controlled front-image analysis test case; do not infer missing back artwork as fact.
- [ ] Redesign the standalone UI to follow the supplied PixelNova marketing mockup&apos;s simple, modern, image-led journey while preserving honest preview states.
- [ ] Implement interactive 3D only after the J180A SVG-to-GLB relationship is empirically verified; block approval if placement is incomplete or distorted.
- [ ] Keep the rejected 228103 compositor disabled and isolated from this new workstream.

Initial live J180A configurator observation: the page identifies the product as **FS Full Button Baseball Jersey — style J180A** and renders a real interactive short-sleeve, full-button baseball garment. The flow is `1. Design → 2. Color → 3. Text & Logo → 4. Roster → 5. Summary`, with fabric selection and named design thumbnails. The initial garment and design thumbnails load progressively; therefore the implementation must inspect runtime assets rather than relying only on first-paint HTML. The captured HTML is stored at `/home/ubuntu/upload/onebuilder.momentecbrands.com_ConfiguratorV2_storeId_10251_catalogId_10151_styleId_J180A_1787862266209.html` for script and hidden-element analysis.

The storefront page embeds the actual configurator in `https://builder2-qa.momentecbrands.com/?styleId=J180A&iFrame=true&currency=USD`. Direct inspection confirms the same five-step flow and exposes more than 100 named design layouts (for example Solid `JD0001`, Jet `JDB028`, Play 3 `JDB022`, Sleeve Pattern `JDBSL1`, and All-Over Pattern `JDBA01`). This establishes that the production builder is not mapping one arbitrary rendered garment photo directly; it combines a fixed style/size garment model with a selected design-layout definition, color channels, text/logo placements, and roster fields. The loaded embedded DOM is stored at `/home/ubuntu/upload/builder2-qa.momentecbrands.com__styleId_J180A_iFrame_true_currency_USD_1787862856720.html`.

Authoritative J180A asset/runtime findings:

- Customer-supplied model URLs: `https://statictest.augustasportswear.com/ua/assets/J180A.glb`, `J180A_S.glb`, and `J180A_L.glb`. The base file and `_S` are byte-identical (SHA-256 `bb3a3ce...98a3`); `_L` is a distinct geometry file (SHA-256 `229547ba...19e`) with the same 11 mesh/material roles but different topology/positions. Correct size-specific model selection is therefore mandatory.
- Customer-supplied production SVG: `https://d31q5t9naund0c.cloudfront.net/onebuilder/svgfilesstage-pim2/prod-J180A-decorations.svg`. It is an Illustrator SVG with viewBox `0 0 6485.3398438 6485.3398438`, eight hidden garment-size groups (`XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL`, `4XL`), and named physical pieces including `back`, `lfront`, `rfront`, `lsleeve`, `rsleeve`, `collar`, `lplacket`, and `rplacket`. `display="none"` on size groups is expected source behavior; the builder activates the selected group at runtime.
- The production SVG contains 38 design-specific decoration sets and the placement vocabulary `BG, BK, BL, BR, BT, JH, LC, LF, LG, LW, MR, MS, RC, RF, UB, UF, UG, UL, UN, UR, US`. These location IDs are the authoritative placement slots; they are more useful than guessing broad image quadrants.
- Live runtime SVG base: `https://d31q5t9naund0c.cloudfront.net/onebuilder/svgfiles-pim2`. The builder loads `preview-{styleId}-decorations.svg` for UV hit testing and decoration-texture generation. For J180A, `preview-J180A-decorations.svg` is structurally different from the production-stage file: 192 groups, 92 paths, 8 rectangles and 28 clip paths, with IDs such as `text:UF_loc`, `text:UB_loc`, `text:BK_loc`, and `mascot:UL_loc`.
- Runtime bundle source: `https://builder2-qa.momentecbrands.com/main-JQGFN6XJ.js`; renderer source: `https://builder2-qa.momentecbrands.com/assets/js/R133/render3d.js`. Configuration sets `svgDecorationsBaseUrl` to the CloudFront path above and `print3dRenderUrl` to `https://stageprint3d.momentecbrands.com/api/render?width3D=1000&texture=`.
- `render3d.js` loads the selected GLB with Three.js/Draco, loads the generated front texture URL (and optional reverse texture), sets `texture.flipY=false`, and applies the texture to outward fabric meshes while preserving buttons/binding/snap trim behavior. J180A GLBs contain **no embedded textures**. They expose paired `Fabric_FRONT_*` and `Fabric_BACK_*` mesh layers sharing corresponding UV bounds, plus the `Button` mesh. This confirms the correct external implementation target: generate the same 2D SVG/canvas texture coordinate system, then apply it to the J180A fabric meshes—not project the customer&apos;s perspective garment photo onto camera-visible triangles.

Verified implementation decision: retain both SVGs. The production-stage SVG provides the full size cut pieces and design/location metadata; the live `preview-J180A-decorations.svg` provides the builder&apos;s hit-test and decoration clip geometry. A valid implementation must activate a selected size group, place extracted assets into named locations/physical parts in this SVG coordinate system, rasterize the resulting 2D texture, then apply it to all outward J180A fabric meshes with `flipY=false`. The supplied front mockup cannot establish an unseen back design; the preview must show that view as undefined until the customer supplies it or explicitly authorizes a generated interpretation.

Direct-analysis validation session `adf46815` used the supplied J180A front image with no preparation API call. The read returned **Baseball / Jersey / garment mockup**, black-purple-yellow-white colors, `Thunder`, body number `24`, visible sleeve `24`, the sleeve mascot, and the purple/yellow lightning-splatter pattern. Five normalized regions and five private PNG assets were created. Discrete assets only receive transparency when the local edge background is stable; otherwise the system keeps an honest contextual reference crop and states that artist validation is required.

Marketing-reference browser validation: the redesigned `/design?mode=submit` opens with a black/yellow brand bar, asymmetric editorial headline, five labelled progress stages, and one dominant white stage surface. The upload screen explicitly states that originals are analyzed as supplied and contains no preparation/background-removal step. The supplied J180A front image loads correctly in the dominant front slot, and `J180A` is accepted in the known-style field. The browser analysis request is currently in progress; the final region-map layout must be checked after the response arrives.

Completed artwork-map browser validation: the direct request finished successfully without calling `/api/prepare-artwork`. The UI displays the original J180A front with five labelled boxes and adjacent PNG cards for `Thunder` wordmark, front number `24`, visible sleeve `24`, sleeve mascot, and lightning/splatter pattern. Each card shows the value, placement and confidence. The contextual crops remain visibly contextual where automatic transparency would be unreliable, which matches the intended artist-review boundary. The responsive desktop composition is readable through the final **Find Matching Styles** action.

### Immediate Customer-Preview Safeguard

- [x] Remove the incomplete 228103 panel-compositor output from the customer-facing test flow immediately.
- [x] Keep the unverified compositor offline-only; the active CDL Express app has no compositor invocation.
- [ ] Require an explicit complete-view review of front, back, player-left sleeve, player-right sleeve, collar/lace, and seams before another experimental 228103 output reaches the browser.

The active renderer now stops rather than completing a job when any requested generated view is unavailable. This is especially relevant while the configured image service returns an HTTP 429 spending-cap error: front/back-only bakes can no longer be labelled as complete customer previews. The emitted five-angle grid was an offline diagnostic artifact, not a new app path. Its visible blank rear led to an additional material check: in 228103 the `reverse` material only appears at the inner collar and hem; it is not the external rear garment. The external rear belongs to the same `main` printable mesh, but the earlier `back_body=10` assumption is now **withdrawn**: the direct atlas shows that island 10 is a narrow lower trim-like region, not the full rear panel. A unique-colour, per-island five-angle contact sheet is now required before selecting any back-body island or continuing the compositor.

The stable numerical and focused visual checks now identify the actual primary mapping as **front body 3, back body 16, player-left sleeve 8, player-right sleeve 7**. The sixth offline proof renders the front crest, the supplied rear `93`, and separate sleeve `9`/`3` without cross-panel bleed; however, the upper back `MARNER` line is still cropped out by the back panel cover-fit. This remains a failing acceptance item. The next offline revision will bias the back-panel source transform toward the top of the customer upload and must show both `MARNER` and `93` before integration.

The ninth offline proof still does not preserve a legible `MARNER` line; it therefore remains rejected and unintegrated. The customer-facing app has been restored to the original stable renderer contract, retains the correct 228103 model descriptor, and passes `pnpm exec tsc --noEmit`. The active service safety gate now rejects a job when any requested generated side is unavailable instead of producing a partial approval mockup. No offline panel-compositor result will be reintroduced until the full rear name/number, both sleeves, front crest, lace/collar, and seams pass together.

The actual two-view analysis now reads the customer assets together and returned `backName=MARNER`, `backNumber=93`, and `sleeveMarks.left=93/right=93`. This corrects the earlier mistaken split-digit `9`/`3` assumption: the customer design has full **93** marks on both sleeves. The integrated app/service test job is **`2e3dfe3a`**. It completed without Gemini side generation, using versioned layout `228103-traditional-lace-up-panel-v1` and the empirically confirmed islands `front_body=3`, `back_body=16`, `left_sleeve=8`, `right_sleeve=7`. The proof shows the correct 228103 construction, isolated front crest, `MARNER / 93` on the rear, and full `93` on both sleeves. The service verdict is deliberately `artist-review-required`, not `good`; exact crest scale, typography, trim continuity, and production cut lines remain artist-controlled.

## Customer Mockup-Page Reference

- [x] Inspect `https://preview.pixelnovasolutions.com/aicreator/m-custom-ai-creator-page.html` and record its relevant composition, hierarchy, and interaction patterns.
- [ ] Apply only the reference&apos;s useful simple, 3D-first mockup presentation patterns to the CDL Express preview; preserve the 228103 technical flow and honest approval boundary.

The reference uses an intentionally sparse black/white presentation with a compact top navigation, a decisive headline, two clearly differentiated actions, a visible product-concept comparison, and one large expandable interaction rather than a crowded multi-control surface. CDL Express will borrow only these principles: keep the active 3D proof dominant, group secondary detail behind a compact disclosure, use one primary progression action, and plainly distinguish a customer concept from an approval/production proof. It will not copy the reference&apos;s branding, claims, imagery, or unrelated AI-builder workflow.

The first standalone panel-compositor proof isolated customer pixels into the calibrated 228103 `main` islands and retained the separate lace/hoop materials, which removes cross-panel camera projection. Its initial **cover-fit** rule still made the chest composition too large, while the experimental **contain** rule left excess base-colour space and omitted the intended rear name/number treatment. Neither proof is accepted. The 228103 SVG&apos;s visible artwork is opaque in this environment, so its existing named logical groups (`text_front`, `text_back`, `text_sleeve`) are retained as structure metadata; safe-area placement remains driven by the empirically labelled GLB UV atlas and must be calibrated further with deterministic output checks.

The fourth offline proof confirms that separate player-left/right sleeve marks can be constrained to their own primary islands without crossing the torso. It also confirms a blocking defect: the displayed rear remains plain blue even after applying the same texture to the GLB `reverse` material, which means the current compositor preview is not drawing the mesh that supplies the physical rear surface. The front composition is still too large for acceptance. The work remains offline-only until the rear mesh and its UV/material relationship are observed and all six required surfaces are complete.

The catalogue provides the decisive correction: **228108** is the *FreeStyle Performance Series Pro V-Neck Hockey Jersey* and **228150** is the *FreeStyle Essential Series Single-Ply Reversible Hockey Jersey*. Neither is the physical construction shown by the customer&apos;s lace-up source image. The compatible local asset is **228103 — FreeStyle Performance Series Traditional Lace Up Hockey Jersey**, with its own 1.9 MB GLB, normal map and 65 KB `artwork.svg` template. Future validation of this design must use 228103.

### 228103 Initial UV Observations

The labelled five-angle diagnostic (`.diagnostics/228103-uv-islands.preview.png`) contains 25 connected UV islands. The following roles are **visually observed**, not inferred from centroids: island **3** is the front torso field (purple; centered in the front and front-facing three-quarter view); island **10** is the back torso field (yellow; centered in the rear); island **7** is the garment&apos;s physical right sleeve (pink; viewer-left in the front view and right side of the rear view); and island **8** is the garment&apos;s physical left sleeve (grey; viewer-right in the front view and left side of the rear view). The upper yoke/collar and cuff construction spans additional islands and must be assigned from the labelled atlas and 228103 SVG before restricting generated views. This evidence invalidates the 228108 `[4,5]` assumption for the actual lace-up model.

The 2048×2048 labelled atlas confirms that these four primary islands are full, distinct cut-piece shapes rather than a single garment rectangle: `3` is the large front-body pattern with a V neck notch; `10` is the large back-body pattern; `8` and `7` are the two large curved sleeves. The top yoke/collar appears as smaller islands (red/green/teal/orange in the diagnostic) and the cuffs as separate lower shapes. Therefore, the production-safe implementation must retain default/base artwork for those secondary pieces while compositing each customer front/back body and sleeve element directly into its matching primary region. The local `228103/artwork.svg` verifies that the production layout exposes independent `text_front`, `text_back`, and `text_sleeve` logical groups, consistent with this four-primary-panel strategy.

The actual supplied `hockey-F.jpg` and `hockey-B.jpg` have been copied to the isolated browser-upload fixture area without modifying their source files. Both were accepted by the local POC as the front and back inputs, visibly showing the Hockey crest and sleeve `93` on the front plus `MARNER / 93` on the back. The known style `228108` has been entered; left and right were deliberately left unprovided so the selected-model generator must create only those views.

The actual-image submission has started. The POC is uploading and preparing both the supplied front and back views before analysis. Left and right remain absent by design, so they will be the only views that the selected-model generator is allowed to synthesize during the 3D stage.

The supplied front design completed background removal and precision upscale from 1200×1200 to 2400×2400 while preserving the customer artwork. The original and prepared views are visibly consistent, with the Hockey crest, sleeve number, black/blue patterning, and white stripes retained. The next in-progress step is analysis of the prepared front asset.

The actual-image analysis correctly identified **Hockey**, **Jersey**, the blue/black/white palette, a central hockey logo, sleeve numbers, and the jersey-shaped mockup source. The known 228108 model appeared first in the match list; its displayed ranking has been corrected so a verified customer-entered style is always treated as authoritative rather than retaining a lower heuristic score.

The actual front/back pair is now running through the selected 228108 GLB in direct mockup-projection mode. The customer-provided front is assigned to the front processing route and the customer-provided `MARNER / 93` design is assigned to the manual back route. Only the absent left and right views are being generated from the selected hockey model&apos;s rendered silhouettes.

The actual design run reached the model-aware view-generation stage and then the four-view UV-atlas bake. The selected service uses the supplied front and back images directly and generates only the missing left and right views. The next check is the final retextured GLB, where the crest/front number, `MARNER / 93` back, and sleeve pattern continuity can be assessed visually.

The actual front/back job remains in the atlas-bake stage after view generation. The next diagnostic will inspect its service status and output artifacts directly so that a successful GLB can be captured and visually assessed rather than inferred from the browser progress message.

The actual customer-image job completed successfully with a 2048×2048 atlas, 92.1% coverage, and a service verdict of `good`. The generated five-angle preview visibly retained the supplied front Hockey crest, blue/black/white striping, blue pattern, and sleeve number treatment; the supplied back visibly retained `MARNER` above the centered `93`. The generated left and right views continue the palette and stripe language around the garment. This is a credible simulation for customer review. It is not a production proof: small side/sleeve details cannot be certified from front/back references alone, and an artist must still validate exact cut-piece placement and vector/font licensing before manufacture.

The actual 228108 atlas inspection confirms the customer&apos;s reported defect. The UV atlas contains separate and rotated body and sleeve islands. The central front crest is mapped upright to one body island, while the back panel is stored rotated and the sleeve/side regions are separate islands. The current generic projection method writes broad rendered-view pixels into those islands. That is why `MARNER / 93` happens to appear acceptably on the rear model but the sleeve/side `93` can be truncated or fall across seams. The correct fix is to render/compose each named cut-piece independently, then pack it into the matching UV island rather than treating the atlas as a single garment photograph.

The generated source images confirm a second concrete defect: the left and right generation prompt was explicitly instructed **not** to repeat sleeve numbers. That rule contradicts the supplied reference, where `93` is visibly printed on both sleeves. The service prompt and its reference-image input now require correction before the actual side views are rendered again.

The corrected 228108 left and right generated views now visibly retain a complete `93`, unlike the prior side generation which intentionally omitted it. However, their position is still inferred from the broad side render rather than constrained to a named sleeve cut-piece; the number can sit in the black side band instead of the exact sleeve-print region. This confirms the prompt repair is necessary but not sufficient. The final atlas must be inspected, then the per-piece UV placement implementation remains required for production-quality sleeve positioning.

## Verified 228108 Mapping Data and Correction

The actual `228108.glb` outer `main` material has 11 connected UV islands. The four primary production regions are: front body island **7** (3D centroid z=+0.1686), back body island **6** (z=-0.1433), model-left sleeve island **5** (x=-0.3283), and model-right sleeve island **4** (x=+0.3312). The SVG cut-piece source is `assets/augusta-live/hockey/228108/artwork.svg`; its logical decoration groups include `branding`, `text-front`, `text-back`, `text-sleeves`, and `mascots`.

The original issue had two causes. First, the visible user screenshot used style **228150**, a V-neck reversible jersey, rather than the requested lace-up **228108** model. Second, the original generic bake let each camera-view image write into every visible outer UV island, allowing side/body pixels and digits to cross seams. The new 228108 asset descriptor passes an explicit `viewIslandMap` through the POC and retexturing service: `front:[7]`, `back:[6]`, `left:[5]`, `right:[4]`. The bake service now restricts each supplied/generated view to those named UV islands.

The latest actual-image job, `f5a94290`, used 228108 with the user front/back input, separate sleeve marks (`left:3`, `right:9`), and panel restrictions. It completed at 2048×2048, 92.1% coverage, verdict `good`. The new five-angle preview visibly separates the front crest, back `MARNER / 93`, and different side digits more cleanly than the prior generic run. It still has visible numeric/trim distortion at seam boundaries, so the current result is a corrected prototype preview—not yet a production-approved cut-piece proof. The remaining full-quality step is to compose the number/logo artwork directly into the `text-sleeves`, `text-front`, and `text-back` SVG regions before the UV atlas is produced.

The first per-view island restriction run, job `845f1210`, proved that the controls reached the baker (`front:[7]`, `back:[6]`, `left:[5]`, `right:[4]`) but left the visible sleeves unpainted. The raw centroid-derived mapping is therefore incomplete: the numbered sleeve surface spans more than one UV island or is not aligned to the assumed left/right labels. A labelled UV-island render has been generated for calibration; the manifest will be revised only after that visual mapping is confirmed.

The colour-calibration atlas confirms the four primary regions: **front body=7** (pink), **back body=6** (brown), and the two full sleeves **4/5** (orange/yellow). The first restricted test was white on the sleeves not because 4/5 were wrong, but because it removed the supplied front/back images from the only camera angles that visibly cover each sleeve&apos;s front and rear surfaces. The actual new rule restores ordinary camera projection for customer-supplied front/back images, then restricts only generated `left:[5]` and `right:[4]` artwork to sleeve-only refinement. This preserves customer-provided sleeve pixels while blocking side-generated artwork from touching a torso panel.

The revised restriction test, job `9cdae2b1`, confirms the forwarding and model selection work (228108, 2048×2048, 80.3% coverage, verdict `good`) but its visible result has unacceptable untextured/white sleeve and yoke regions. It fails the visual-quality acceptance test. The newest left source shows that the generator does paint a full sleeve correctly, so the blank sleeve is caused by applying the restriction to customer front/back views rather than by the model-aware side generator. The next test uses camera projection for supplied front/back artwork and sleeve-only restriction solely for generated side refinement. A full production cut-piece compositor remains the required long-term solution.

## Design Page Recovery

- [x] Identify the source-level reason `/design/page` no longer exports a React component.
- [x] Repair the component module without removing the 228108 mapping changes.
- [x] Run type and production-build validation, then restart the local development server from a clean cache.
- [x] Reopen the customer flow and resume the actual hockey-image 228108 test.

The page source retains a valid `export default function DesignPage()` that returns the `DesignPageInner` component inside `Suspense`. The reported error was a stale Next development compilation artifact created while an optimized build and a live development server shared the `.next` directory; it was not a missing component export in the source. After stopping the old server, moving the stale cache aside, running `pnpm exec tsc --noEmit` and `pnpm build` successfully, then restarting `pnpm dev` on port 3200, `GET /design?mode=submit` returns HTTP 200.
