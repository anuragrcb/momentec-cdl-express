# CDL Express — How It Works

A customer uploads a photo of a jersey. We find the closest Momentec catalog garment, show the customer four views of their design on that garment, and then build a proof PDF in the background.

- Region: `ap-southeast-2` (Sydney). AWS setup details are in `docs/aws.md` in the repo.
- No secrets are in this file.
- This file was checked against the code.
- Every step below lists its **input**, its **output**, and the **exact prompt** sent to OpenAI or Magnific. Prompts are folded away. Click to open them.

---

## The flow at a glance

```text
  CDL EXPRESS · END-TO-END FLOW

STOPS                                WHAT HAPPENS                   WHO DOES THE WORK

  ON THE PAGE · CUSTOMER WAITS
                          ┌──────────────────────────────────┐
                          │ 1  Customer drops 1-8 photos     │ ◄──► Browser
                          │    background removed on device  │      isnet_quint8 cut-out
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
runs alongside step 1  ···│ 2  Guess category & gender       │ ◄──► OpenAI
                          │    POST /suggest (first photo)   │      suggest_fit
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
one-piece / not made   ◄──┤ 3  Describe the garment          │ ◄──► OpenAI
→ stop (422)              │    POST /generate starts here    │      describe_garment
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
                          │ 4  Find similar catalog styles   │ ◄──► Catalog search Lambda
                          │    up to 3 searches              │      POST /search + X-API-Key
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
no images found        ◄──┤ 5  Fetch blank 3D views          │ ◄──► Garment renders
→ stop (422)              │    4 angles, up to 3 styles      │      GET preview-{style}_{view}
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
not sure (< 0.6)       ◄──┤ 6  Pick best style + plan        │ ◄──► OpenAI · judge_garment
→ artist review (422)     │    colors snapped to Momentec    │ ◄──► Catalog Lambda · /colors/nearest
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
"Apply this edit"      ──►┤ 7  Paint the four views          │ ◄──► Magnific
re-runs step 7 only       │    customer sees views + note    │      gpt-image-2-edit
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
                          │ 8  Customer submits              │ ◄──► S3
                          │    POST /submit → 202, done      │      sheet.png + job.json
                          └────────────────┬─────────────────┘
                                           │
- - - - - - - - - - - - - - - - - - - - - -│- - - - - - - - - - - - - - - - - - - - - - - - - -
  PROOF LAMBDA · NOBODY WAITS              │   Lambda Invoke (async)
  (customer can close the page)            │   { bucket, jobId }
                                           ▼
                          ┌──────────────────────────────────┐
                          │ 9  Proof Lambda starts           │ ◄──► S3
                          │    status = running              │      read sheet.png + job.json
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
                          │ 10 List marks & fill colors      │ ◄──► OpenAI
                          │    off-spot marks are dropped    │      decoration_list
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
                          │ 11 Draw each mark on white       │ ◄──► Magnific
                          │    two waves; front/back = crops │      gpt-image-2-edit (per mark)
                          └────────────────┬─────────────────┘
                                           ▼
                          ┌──────────────────────────────────┐
                          │ 12 Build the proof PDF           │ ◄──► S3
                          │    3 pages, status = done/failed │      proof.pdf + status.json
                          └──────────────────────────────────┘

  Two AWS Lambdas: catalog search (steps 4, 6) and proof (steps 9-12).
  They never call each other.
```

**Steps 1–8** happen while the customer is on the page. Steps 4 and 6 call the **catalog search Lambda**.
**Steps 9–12** run in the **proof Lambda** after the customer has left.

There are **two AWS Lambdas**, and they never call each other:

| | Catalog search Lambda | Proof Lambda |
|---|---|---|
| **Name** | `momentec-catalog-search` | `momentec-cdl-proof` |
| **Used in** | Steps 4 and 6, while the customer waits | Steps 9–12, after the customer leaves |
| **What it is** | FastAPI app (`Momentec_VectorEmbeddings/`), vector search with `BAAI/bge-small-en-v1.5` | TypeScript (`lambda/`), OpenAI + Magnific + PDFKit |
| **How it's called** | Public **function URL** over HTTPS: `POST /search`, `POST /colors/nearest` | AWS SDK `Invoke` (async). No function URL. |
| **Auth** | Header `X-API-Key` must match the function's `API_KEY` env var (URL auth type is NONE) | IAM: only the `momentec-cdl-app` user may invoke it |
| **Package** | Container image in ECR | Zip upload |
| **Settings** | x86_64, 2048 MB, 2 min timeout | Node.js 24.x, x86_64, 2048 MB, 15 min timeout |
| **Watch out** | Cold start takes about 30 s (the model loads) | AWS retries a failed async run twice, then stops |

---

## The pieces

| Piece | What it does |
|---|---|
| **Website** | Next.js app. Shows the upload form and runs the API routes. |
| **OpenAI** | Looks at images and answers in strict JSON. Model `gpt-6-sol`. It never draws. |
| **Catalog search Lambda** | `momentec-catalog-search`, called through its function URL. Finds catalog styles and the nearest Momentec colors. |
| **Garment renders** | Momentec's blank 3D pictures of each style (front, back, left, right). |
| **Magnific** | Draws images (`gpt-image-2-edit`): the four views, and each mark for the PDF. |
| **S3** | Bucket `momentec-cdl-proofs-946033679274`. One folder per job. |
| **Proof Lambda** | `momentec-cdl-proof`. Builds the PDF after the customer leaves. |

### Website endpoints

| Endpoint | Input | Output | Step |
|---|---|---|---|
| `POST /api/upload-ai-design/suggest` | form: `reference` (1 image) | `{ category, gender }` | 2 |
| `POST /api/upload-ai-design/generate` | form: `reference` (1+ images), `gender`, `category` (+ `instruction`, `template`, `catalog` for an edit) | four views, sheet, style, plan, note | 3–7 |
| `POST /api/upload-ai-design/submit` | form: `sheet`, `gender`, `size`, `category`, `name`, `email`, `message`, `catalog` | `202 { jobId }` | 8 |
| `POST /api/upload-ai-design/model` | form: `front`, `back`, `left`, `right` (images) | `model.glb` file | 3D button |
| `POST /api/upload-ai-design/match` | form: `photo`, `gender`, `category` | `{ query, style, matches, plan }` | not used by the page |

Errors from every route come back as `{ "error": "message" }`. Errors from `/generate` and `/match` also include `query`, `style: null`, and `matches`.

---

## How the outside calls work

These shapes are the same every time, so they are written once here.

### OpenAI call (`lib/openai-json.ts`, copied into `lambda/src/openai-json.ts`)

```js
openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || "gpt-6-sol",
  reasoning_effort: "low",                     // no temperature is sent
  response_format: {
    type: "json_schema",
    json_schema: { name: "<schema name>", strict: true, schema: { ... } }
  },
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "<prompt>" },
      { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
      // ...more text and images, in order
    ]
  }]
})
// Output: choices[0].message.content → JSON.parse(...)
```

### Magnific image call (`lib/magnific.ts`, copied into `lambda/src/magnific.ts`)

1. **Upload each image** so Magnific can read it:
   `POST https://api.magnific.com/v1/ai/uploads/request-url` with `{ "files": [{ "content_type": "image/png" }] }`
   → `{ files: [{ upload_url, headers, asset_url }] }`, then `PUT` the bytes to `upload_url`.
2. **Start the edit:** `POST /v1/ai/text-to-image/gpt-image-2-edit`

   ```json
   {
     "prompt": "<prompt>",
     "reference_images": ["<asset_url 1>", "<asset_url 2>"],
     "num_images": 1,
     "resolution": "1k",
     "aspect_ratio": "traditional_3_4",
     "quality": "low",
     "output_format": "png",
     "background": "opaque"
   }
   ```

   → `{ data: { task_id, status: "CREATED" } }`. If the reply says "Error consuming credits", it tries once more after 3 s.
3. **Poll** `GET /v1/ai/text-to-image/gpt-image-2-edit/{task_id}` every 1.5 s, for up to 300 s, until `status` is `COMPLETED`.
4. **Download** `data.generated[0]` → PNG bytes.

Header on every call: `x-magnific-api-key`.

### Catalog search Lambda calls

The website calls the catalog search Lambda's function URL directly over HTTPS (`lib/catalog-match.ts`, `lib/colors.ts`).

| Call | Input | Output |
|---|---|---|
| `POST {catalog}/search` | `{ query, top_k: 12, collections: ["products"], group_products_by_style: true, product_filters: { segment?, sport? } }` | `{ results: { products: [{ style, name, brand, sport, segment, score, logo_locations[], text_locations[], color_zones[] }] } }` |
| `POST {catalog}/colors/nearest` | `{ color: "#A31F2D", top_k: 20, brand? }` (4 s timeout) | `{ results: [{ name, hex, tonal }] }`. The first non-tonal result is used. |

Header: `X-API-Key`. `{catalog}` is the function URL (`MOMENTEC_CATALOG_SEARCH_URL` without the trailing `/search`). `/health` is open without a key.

---

## Step by step

### Part 1 — On the page

### 1. Customer drops photos

Runs in the browser only (`lib/client-image.ts`).

| | |
|---|---|
| **Input** | Up to 8 jpg, png, or webp files |
| **What happens** | The photo is shrunk to 512 px to make a cut-out mask (`@imgly/background-removal`, model `isnet_quint8`). The mask is applied to the full photo, the long edge is capped at 1536 px, and the garment is placed on white. |
| **Output** | A PNG of the garment on white, marked "ready". If the cut-out fails, the photo is not used. |

### 2. Guess category and gender

`POST /api/upload-ai-design/suggest` · runs at the same time as step 1, with the **original** first photo.

| | |
|---|---|
| **Input** | form field `reference` = first photo |
| **OpenAI call** | schema `suggest_fit`. Content: prompt, then the photo. No retry. |
| **OpenAI output** | `{ "category": "BASEBALL", "gender": "Men" }` (both are enums: the 20 form categories, and Men / Women / Youth) |
| **Route output** | `200 { "category": "BASEBALL", "gender": "Men" }` |
| **Errors** | `400` no file or wrong type · `503` no OpenAI key · `422` answer not valid · `502` OpenAI error. The customer can still pick by hand. |

<details>
<summary>Prompt sent to OpenAI — <code>SUGGEST_PROMPT</code> (lib/suggest-fit.ts)</summary>

```text
Look at this uploaded garment photo and choose the closest Momentec form values.
Pick the category from the garment itself (a baseball jersey is BASEBALL, a tee is TEES, shorts are BOTTOMS). Do not choose the sport from a printed team name or logo.
Pick Youth only when the garment is clearly a youth or kids cut. Pick Women for a ladies cut. Otherwise pick Men.

Reply with one category and one gender from the allowed values.
```
</details>

### 3. Describe the garment

The start of `POST /api/upload-ai-design/generate` (steps 3–7 are one request, max 300 s).

**Route input**

| Field | New design | Edit ("Apply this edit") |
|---|---|---|
| `reference` | every ready photo | the four current views |
| `gender`, `category` | required | sent, but not required |
| `instruction` | — | the customer's change note |
| `template` | — | the blank 2x2 PNG from the last response |
| `catalog` | — | the `catalog` JSON from the last response |

**This step**

| | |
|---|---|
| **Input** | The first photo (any transparency is flattened onto white first) |
| **OpenAI call** | schema `describe_garment`. Content: prompt, then the photo. Up to 2 tries. |
| **Output** | Product names to search for, plus what the garment looks like |

```json
{
  "supported": true,
  "unsupported_reason": "",
  "queries": ["V-Neck Hockey Jersey", "Long Sleeve Hockey Jersey", "Hockey Jersey"],
  "garment_piece": "top",
  "sleeves": "long",
  "segment": "adult",
  "logo_locations": ["Front Center Full"],
  "text_locations": ["Left Short Sleeve"],
  "has_buttons": false,
  "color_panels": 2,
  "confidence": 0.8
}
```

- At most 3 `queries` are kept.
- `garment_piece` of `one-piece` or `other` always counts as not supported.
- **Stop:** not supported → `422` with the model's reason. Both tries failed → `422` "We could not read this design. An artist needs to review it."

<details>
<summary>Prompt sent to OpenAI — <code>DESCRIBE_PROMPT</code> (lib/catalog-match.ts)</summary>

```text
Analyze this uploaded garment image to search the Momentec sublimation catalog.
Note how Momentec names products in its catalog:
- Sleeveless tops are named: "Traditional Track Jersey" (scoop neck, sleeveless straps), "Fitted Track Jersey" (fitted sleeveless), "Basketball Jersey" (V-neck or crew sleeveless), "Racerback Basketball Jersey", "Dynaspeed Sleeveless Compression" (tight muscle tank), "Lacrosse Tank", "Reversible Lacrosse Pinnie", "Sleeveless Baseball Jersey", "Sleeveless Softball Jersey", "Sleeveless Hoodie", "Cheer Shell". (Do NOT put the word "Sleeveless" before Basketball Jersey or Track Jersey, and NEVER use "Compression Sleeve" for a shirt.)
- Short-sleeve tops are named: "Turbo Training Tee" (crew neck athletic tee/jersey), "Turbo V-Neck Tee", "Raglan Tee", "Crew Neck Baseball Jersey", "V-Neck Baseball Jersey", "Full-Button Baseball Jersey", "Two-Button Baseball Jersey", "Faux Full-Button Baseball Jersey", "Short Sleeve Softball Jersey", "2-Button Softball Jersey", "Football Jersey", "Flag Football Jersey", "Lacrosse Jersey", "Sublimated Polo", "Dynaspeed Short Sleeve Compression", "Short Sleeve Hoodie", "Volleyball Tee". (Do NOT put "Short Sleeve" before Crew Neck Baseball Jersey, V-Neck Baseball Jersey, Training Tee, or Football Jersey.)
- Long-sleeve / 3/4 tops & outerwear are named: "Long Sleeve Training Tee", "3/4 Sleeve Trainer", "V-Neck Hockey Jersey", "Traditional Lace Up Hockey Jersey", "Long Sleeve Dek Hockey Jersey", "Long Sleeve Hoodie", "Fleece Hoodie", "1/4 Zip Pullover", "Fleece Crew Neck", "Full-Zip Jacket", "Long Sleeve Compression Tee", "Long Sleeve Cheer Top".
- Bottoms are named: "Basketball Shorts", "Traditional Track Shorts", "Fitted Track Shorts", "Training Shorts", "Softball Shorts", "Baseball Pant", "Baseball Knicker", "Football Pant", "Lacrosse Shorts", "Cheer Skirt", "Cheer Skort", "7v7 Compression Shorts", "Baselayer Tight", "Sublimated Pant".
- Accessories are named: "Compression Sleeve" (arm sleeve), "Headband", "Gaiter", "Face Mask", "Hockey Tube Socks", "Fleece Blanket".
- Unsupported garments: Momentec ONLY manufactures separate two-piece tops, bottoms, and the listed accessories above. It CANNOT manufacture one-piece wrestling singlets, unitards, bodysuits, leotards, swimsuits, dresses, overalls, rompers, shoes, helmets, or bags. If the uploaded image is an unsupported garment type (for example, a one-piece wrestling singlet where the top and attached shorts are one continuous garment), set "supported": false and explain why in "unsupported_reason".

Ignore the specific team name or artwork topic (do not guess a sport from a printed logo or state map). Look at the physical garment cut, neckline, sleeves, visible logo placements, visible text/number placements, and number of fabric color panels.

Reply with ONLY valid JSON in this exact shape:
{
  "supported": true,
  "unsupported_reason": "",
  "queries": ["<best catalog product name>", "<second closest catalog product name>", "<third closest catalog product name>"],
  "garment_piece": "top",
  "sleeves": "short",
  "segment": "adult",
  "logo_locations": [],
  "text_locations": [],
  "has_buttons": false,
  "color_panels": 2,
  "confidence": 0.0
}
logo_locations and text_locations must list only placements that are actually visible. Use an empty array when none are visible. confidence is 0 to 1.
```
</details>

### 4. Find similar catalog styles

| | |
|---|---|
| **Input** | The `queries` from step 3, plus the form's gender and category |
| **Call** | Catalog search Lambda: `POST {catalog}/search` once per query, all in parallel (see [Catalog search Lambda calls](#catalog-search-lambda-calls)) |
| **Filters** | `segment`: Men → `adult`, Women → `ladies`, Youth → `youth` (if gender is empty, the model's `segment` is used). `sport`: the category in capitals. |
| **Fallback** | Fewer than 3 results → search again without `sport`. Still fewer than 3 → search with no filters. |
| **Clean-up** | Removes styles with broken pictures (`UP` + digit, `UFO`, `UPO`, `UPB`, `URS`), accessories (unless asked for), and tops/bottoms of the wrong kind. Pushes partner styles down. Adds or takes off points for sleeves, buttons, and matching logo/text spots. Keeps one style per cut. |
| **Output** | A ranked list of catalog styles |

Example request:

```json
{
  "query": "V-Neck Hockey Jersey",
  "top_k": 12,
  "collections": ["products"],
  "group_products_by_style": true,
  "product_filters": { "segment": "adult", "sport": "HOCKEY" }
}
```

### 5. Fetch blank 3D views

| | |
|---|---|
| **Input** | The top 6 styles from step 4 |
| **Call** | `GET {GARMENT_IMAGE_URL up to "preview-"}{style}_{front\|back\|left\|right}` — 4 pictures per style, 8 s timeout each |
| **What happens** | The first 3 styles are fetched together. If any fail, the next styles are tried one by one until 3 work. A style needs all 4 pictures. |
| **Output** | Up to 3 PNG sheets, each 960 × 1280: front top-left, back top-right, left bottom-left, right bottom-right, with a white cross between them |
| **Stop** | No style worked → `422` "We cannot manufacture this garment because no matching style was found in our catalog." |

### 6. Pick the best style and write a plan

| | |
|---|---|
| **Input** | The photo, the step 3 description, and the candidate sheets from step 5 |
| **OpenAI call** | schema `judge_garment` (`winner_style` must be one of the candidate codes or `none`). Up to 2 tries. |
| **Content sent, in order** | 1. the prompt + `Candidate style codes: …` + a summary of step 3 · 2. the customer photo · 3. for each candidate: a label line, then its 2x2 sheet |
| **Output** | The winning style and the plan (below) |
| **Stop** | `none`, not a candidate, `supported: false`, or confidence below **0.6** → `422`. The message is the model's reason, or "An artist needs to review this design before we can make it." |

Example output:

```json
{
  "supported": true,
  "unsupported_reason": "",
  "winner_style": "228350",
  "confidence": 0.74,
  "color_zone_mapping": ["Body Color: scarlet #A31F2D"],
  "logo_mapping": ["Front Center Full (m2): Hays Sluggers crest"],
  "text_mapping": ["Left Short Sleeve (t24): HYB"],
  "not_possible": [
    { "mark": "small label at the front hem", "reason": "this style has no logo spot there" }
  ],
  "can_do": ["Hays Sluggers logo on the front", "number 10", "NAME on the back"],
  "view_plan": { "front": "...", "back": "...", "left": "...", "right": "..." }
}
```

**What the code does after the answer**

1. **Better candidate check:** if a real mark was left off (not a hem tag, jock tag, size tag, or care label), and another candidate supports more of the detected logo/text spots, that candidate is judged again on its own. It replaces the winner only if it also passes.
2. **Filter:** removes plan lines that use a spot or color zone the style doesn't have.
3. **Snap colors:** each `#RRGGBB` is sent to the catalog search Lambda's `/colors/nearest`. If that fails, the closest of the 173 colors in `lib/colors.ts` is used (tonal colors skipped). The line becomes, for example, `Body Color: SCARLET (#A31F2D)`.
4. **Customer note:** built from `can_do` and `not_possible`, with style numbers and codes removed.

<details>
<summary>Prompt sent to OpenAI — <code>JUDGE_AND_PLAN_PROMPT</code> (lib/catalog-match.ts)</summary>

```text
Image 1 is the customer's uploaded garment design.
Each following image is a 2x2 3D render (Top-Left: Front, Top-Right: Back, Bottom-Left: Left side, Bottom-Right: Right side) of one candidate Momentec catalog style, accompanied by its catalog name, allowed logo placements, allowed text placements, and color zones.

Your task has two parts:
1. Pick the closest candidate catalog style that matches the physical garment silhouette and construction (neckline shape such as scoop vs crew vs V-neck, sleeve/strap cut, button placket if any, torso fit, and hem) and can print the customer's visible logos and text. If the closest cut cannot print those marks, choose the next closest candidate that can.
   If NONE of the candidate catalog styles match the physical construction of Image 1 (for example, Image 1 is a one-piece singlet/bodysuit/dress or a completely different garment cut than all candidates), set "supported": false and explain why in "unsupported_reason".
2. For the winning catalog style, map the customer's uploaded design onto ONLY that catalog garment's allowed color_zones, allowed logo_locations, and allowed text_locations so an image generator can project the customer's texture and artwork onto all 4 views of the winning catalog style's 3D template:
   - In "color_zone_mapping", assign ONLY the color zones that exist in the winning style's color_zones list (such as Body Color, Accent 1, Accent 2, Button Color, Collar/Trim) to the color, gradient, or sublimation pattern visible on the customer's garment (always include a 6-digit #RRGGBB hex code for every color). Omit any color panel that does not exist on the winning style.
   - In "logo_mapping", include a logo/crest/patch/graphic ONLY if the winning style's allowed logo_locations list supports the physical placement where that logo appears on the customer's garment (include the exact location code and name from the winning style's allowed logo_locations, what the logo looks like with 6-digit #RRGGBB hex codes for its colors, and which view it sits on). A logo that has lettering inside it is one logo. Keep the words and the picture together. Do not file the words as text and the picture as a separate graphic. If a logo appears on a placement NOT in the winning style's allowed logo_locations, OMIT the whole logo — do not move it to another location and do not invent logos.
   - In "text_mapping", include a wordmark/name/number ONLY if it is separate from a logo and the winning style's allowed text_locations list supports that placement (include the exact location code and name from the winning style's allowed text_locations, the exact text/number, its fill/outline 6-digit #RRGGBB hex codes and font style, and which view it sits on). Do not repeat words that are already part of a logo. If text or a number appears on a placement NOT in the winning style's allowed text_locations, OMIT it completely — do not move it to another location and do not invent text.
   - In "view_plan", write concrete visual instructions for what must appear on the front, back, left, and right cells when projecting the customer's design onto the winning catalog garment's 3D shape (include 6-digit #RRGGBB hex codes for every fabric zone, trim, logo, and text color mentioned). Mention ONLY the logos and text/numbers that were kept in "logo_mapping" and "text_mapping". If any visible logo, text, or number on Image 1 sits on an unsupported placement for the winning style, explicitly state in that view's plan to leave that area clean/blank and omit that mark.
   - Color formatting rule: whenever you reference any color in "color_zone_mapping", "logo_mapping", "text_mapping", or "view_plan", always include its 6-digit "#RRGGBB" hex code (for example, "purple (#4B1D70)") so every color can be snapped to the manufacturer's official brand palette before rendering.
   - "not_possible" and "can_do" are shown to the customer. Write them in plain words a customer understands. Say what mark is left off and why, and what will still be printed. A logo and the lettering inside it are one mark. Do not say the words can be printed and the picture cannot. Do not include style numbers or location codes such as m2 or t22. Leave "not_possible" empty when nothing visible is left off.

Reply with ONLY valid JSON in this exact shape:
{
  "supported": true,
  "unsupported_reason": "",
  "winner_style": "<one of the candidate style codes, or none>",
  "confidence": 0.0,
  "color_zone_mapping": [],
  "logo_mapping": [],
  "text_mapping": [],
  "not_possible": [
    { "mark": "...", "reason": "..." }
  ],
  "can_do": ["..."],
  "view_plan": {
    "front": "...",
    "back": "...",
    "left": "...",
    "right": "..."
  }
}
winner_style must be one of the candidate style codes, or "none" when no candidate matches. confidence is 0 to 1. Use 0 when you are not sure.

Candidate style codes: {code1}, {code2}, {code3}

Uploaded garment detected placements — Logos: {logo_locations or none}; Text/Numbers: {text_locations or none}; Buttons: {yes|no}; Approx color panels: {color_panels}.
```

Then the customer photo. Then, for each candidate, this label followed by its 2x2 sheet:

```text
Candidate style {style}: "{name}" (Brand: {brand}, Sport: {sport}, Segment: {segment}). Allowed logo locations: {Name (code), ...}. Allowed text locations: {Name (code), ...}. Color zones: {Name (code), ...}. 2x2 views (front, back, left, right):
```
</details>

### 7. Paint the four views

| | |
|---|---|
| **Input** | **Image 1** = the winning style's blank 2x2 sheet. **Image 2, 3, …** = every ready customer photo (for an edit: the four current views). Plus the snapped plan from step 6. |
| **Magnific call** | `gpt-image-2-edit`, 3:4 ratio, 1k, low quality (see [Magnific image call](#magnific-image-call-libmagnificts-copied-into-lambdasrcmagnificts)) |
| **What happens** | Magnific paints the design onto the blank garment. The code finds the white cross in the result and cuts out four pictures. |
| **Output** | One 2x2 PNG, split into front, back, left, right |
| **Stop** | Magnific failed → `502` "Could not generate the other views." No Magnific key → `503`. |

**Route output** (`200`, end of `/generate`):

```json
{
  "images": { "front": "<base64 png>", "back": "...", "left": "...", "right": "..." },
  "sheet": "<base64 png of the full 2x2>",
  "style": "228350",
  "query": "V-Neck Hockey Jersey | Long Sleeve Hockey Jersey | Hockey Jersey",
  "matches": [ { "style": "228350", "name": "...", "brand": "...", "score": 0.81, "...": "..." } ],
  "plan": { "colorZoneMapping": [], "logoMapping": [], "textMapping": [], "viewPlan": { "front": "...", "back": "...", "left": "...", "right": "..." } },
  "limits": "We made this with Hays Sluggers logo on the front, number 10 and NAME on the back.\nWe couldn't add small label at the front hem. This style has no logo spot there.",
  "template": "<base64 png of the blank 2x2>",
  "catalog": { "style": "228350", "name": "...", "brand": "...", "logo_locations": [], "text_locations": [], "color_zones": [], "plan": { } }
}
```

The page keeps `template` and `catalog` for edits and for submit. An edit returns the same shape, but `query` and `limits` are empty and no new catalog search or OpenAI call is made.

<details>
<summary>Prompt sent to Magnific — <code>buildCatalogProjectionPrompt</code> (lib/upload-ai-sheet.ts)</summary>

Values in `{braces}` are filled in from the plan and the winning style.

```text
Project the customer's custom garment design onto the exact 2x2 3D catalog garment template shown in Image 1.

- Image 1 is the manufacturer's 2x2 3D garment template for catalog style {style} ("{style name}"). Its four cells show:
  - Top-left cell: the FRONT of that one solid 3D garment, orthographic, straight on. The chest faces the camera. Sleeves have thickness and come slightly forward. The collar is an opening, not a flat ring
  - Top-right cell: the BACK of the same solid 3D garment, orthographic, turned 180 degrees. The back panel faces the camera. Sleeves keep the same thickness. The collar opening is still a hole
  - Bottom-left cell: the LEFT side of the same solid 3D garment, a true 90 degree turn. This is the side on the viewer's left in the front view, and the front of the garment points toward the left edge of the cell. Show the depth of the torso and the sleeve as a form, not a paper-thin outline
  - Bottom-right cell: the RIGHT side of the same solid 3D garment, a true 90 degree turn. This is the side on the viewer's right in the front view, and the front of the garment points toward the right edge of the cell. Show the depth of the torso and the sleeve as a form, not a paper-thin outline
- Image 2 is the customer's uploaded custom design reference.
  (with more photos: "Image 2, Image 3 are the customer's uploaded custom design references.")

Critical shape & construction rules (MUST follow Image 1):
- Keep the EXACT 3D garment silhouette, collar/neckline cut, sleeve cut & length, button placket (if present in Image 1), hem shape, 3D volume, camera angles, scale, and 2x2 cell positions of Image 1.
- Do NOT alter the garment cut to match Image 2 if Image 2 has a different collar, sleeve, or hem. Image 1 is the only manufacturable garment shape.

Critical color rules (MUST follow the snapped Momentec catalog hex codes below):
- Every color in the specification below has already been matched to the closest manufacturable Momentec brand color and #RRGGBB hex code for style {style} ({brand or "Momentec"}).
- Paint every fabric color zone, collar/trim, button, logo, wordmark, and number using the exact Momentec color name and #RRGGBB hex code listed below — even if Image 2 shows a different raw shade or hue. Do NOT copy unsnapped shades from Image 2 when a Momentec hex code is specified below.

Critical placement rules (ONLY supported catalog locations for style {style} may be decorated):
- Style {style} ONLY supports these logo locations: {Name (code), ... or none}.
- Style {style} ONLY supports these text/number locations: {Name (code), ... or none}.
- Render ONLY the logos listed under "Allowed logo placements to apply" and ONLY the text/numbers listed under "Allowed text/number placements to apply" below.
- If Image 2 has any logo, patch, graphic, wordmark, name, or number on a placement that is NOT explicitly listed below, DO NOT draw it — leave that area of the garment completely blank/clean fabric.

Catalog color-zone & decoration placement specification (mapped from the customer's design onto style {style}):
- Color zones:
  - {each colorZoneMapping line}
    (if none: "Match the primary fabric colors, accent panels, and sublimation pattern shown in the customer's design.")
- Allowed logo placements to apply:
  - {each logoMapping line}
    (if none: "NONE (do NOT place any logos, crests, patches, or graphics anywhere on the garment, even if present on Image 2).")
- Allowed text/number placements to apply:
  - {each textMapping line}
    (if none: "NONE (do NOT place any text, wordmarks, names, or numbers anywhere on the garment, even if present on Image 2).")

Per-view projection breakdown:
- Top-left cell (FRONT view): {viewPlan.front}
- Top-right cell (BACK view): {viewPlan.back}
- Bottom-left cell (LEFT side view): {viewPlan.left}
- Bottom-right cell (RIGHT side view): {viewPlan.right}

Hard layout rules:
- Each cell contains exactly one garment. Never draw two garments or two angles together in one cell.
- Plain white background (#FFFFFF) in every cell. Keep the wide plain white cross through the exact center, horizontal and vertical, about one tenth of the sheet wide, cleanly separating the four cells. No garment may touch or cross that white cross. No shadow or backdrop.
- Draw each garment at full length from top edge to bottom edge inside its cell, matching Image 1's scale and placement.
- Do not draw any captions, labels, or view names. Only marks that belong on the garment fabric itself may appear.
- The garment is empty: no person, mannequin, hanger, neck, skin, or arms.

Output only the completed 2x2 image.
```

For an edit, these lines are added just before the last line (the note is cut to 400 characters):

```text
Requested change: {customer's note}
Apply that change on every view. Do not change the garment cut away from Image 1.
```
</details>

### 8. Customer submits

`POST /api/upload-ai-design/submit`

| | |
|---|---|
| **Input** | `sheet` (2x2 PNG, max 25 MB), `gender`, `size` (XS–3XL), `category`, `name` (max 120), `email` (max 200), `message` (optional, max 2000), `catalog` (JSON from step 7) |
| **S3 writes** | `{jobId}/sheet.png` and `{jobId}/job.json` |
| **Lambda call** | `Invoke` with `InvocationType: "Event"` (fire and forget), payload `{ "bucket": "...", "jobId": "..." }` |
| **Output** | `202 { "jobId": "job-2026-10-16T21-04-00Z_<uuid>" }`. The page says "You can close this page." |
| **Errors** | `400` missing or bad field · `503` AWS settings missing · `502` S3 or Lambda failed |

`job.json` looks like this:

```json
{
  "jobId": "job-2026-10-16T21-04-00Z_<uuid>",
  "gender": "Men",
  "size": "L",
  "category": "HOCKEY",
  "name": "John Doe",
  "email": "john@example.com",
  "message": "Make the logo bigger",
  "catalog": { "style": "228350", "name": "...", "brand": "...", "logo_locations": [], "text_locations": [], "color_zones": [], "plan": { } }
}
```

### Part 2 — In the proof Lambda (nobody waits)

### 9. Proof Lambda starts

| | |
|---|---|
| **Input** | Event `{ "bucket": "...", "jobId": "..." }` |
| **What happens** | Writes `status.json` = `running`, then reads `job.json` and `sheet.png` from S3 |
| **Output** | The sheet image, gender, size, customer name and message, and the catalog style with its allowed spots |

### 10. List marks and fill colors

| | |
|---|---|
| **Input** | The 2x2 sheet, gender + size, and the catalog style |
| **OpenAI call** | schema `decoration_list`. Content: one text block (size sentence + catalog block + prompt), then the sheet. Up to 2 tries, otherwise the job fails. |
| **Output** | Fabric colors, team marks, and roster marks (below) |
| **Clean-up** | Colors that aren't a catalog color zone are dropped (max 8). Marks that aren't on an allowed spot are dropped (max 12, one per spot and kind). Heights snap to the allowed inch sizes. Every color snaps to a Momentec color. |

Example output:

```json
{
  "fillColors": [ { "role": "BODY COLOR", "name": "SCARLET", "hex": "#A31F2D" } ],
  "teamDecoration": [
    {
      "cell": "front",
      "locationCode": "m2",
      "kind": "logo",
      "view": "FRONT CENTER FULL SUBLIMATION",
      "colors": [ { "name": "WHITE", "hex": "#FFFFFF" } ],
      "prompt": "Isolate the Hays Sluggers crest from the front center ...",
      "place": { "fromTop": 0.25, "fromCenter": 0, "width": 0.6, "height": 0.3 },
      "fit": { "widthIn": 10, "heightIn": 8, "upIn": 0, "downIn": 0, "leftIn": 0, "rightIn": 0 }
    }
  ],
  "rosterDecoration": [ ]
}
```

<details>
<summary>Prompt sent to OpenAI — size sentence + catalog block + <code>DECORATION_LIST_PROMPT</code> (lambda/src/decorations.ts)</summary>

First the size sentence:

```text
This garment is a {Men's | Women's | Youth} {size}.
```

Then the catalog block (only the parts that exist):

```text
Matched Momentec catalog style: {style} ("{name}"), Brand: {brand}, Sport: {sport}.
Official catalog color_zones for style {style} (use these exact zone names as fillColors[].role):
- {ZONE NAME} ({code})
Official catalog logo_locations for style {style} (use for team logos/graphics):
- {code}: {NAME} -> view "{NAME} SUBLIMATION"
Official catalog text_locations for style {style} (use for team wordmarks/lettering and roster numbers/names):
- {code}: {NAME} (allowed heights in inches: {params})
Previously mapped design placements on this garment:
- {each plan line from step 6}
```

Then the main prompt:

```text
This image is a 2x2 product sheet of one sportswear garment.
Top-left is the front. Top-right is the back. Bottom-left is the left side. Bottom-right is the right side.

Divide the applied decorations you can actually see into two groups:

1. teamDecoration: team or company logos, crests, badges, flags, patches, and team wordmarks/lettering (such as a team name across the chest or initials on a sleeve). Not a player number and not a player name. Ignore tiny manufacturer jock tags or size tags at the bottom hem.
2. rosterDecoration: individualized player numbers and player names only.

Critical rules for counting marks:
- A mark counts only when its shape or lettering is clearly visible on the garment. Skip garment fabric panels, seams, collar, cuffs, piping, and trim. Empty arrays are correct when a group has nothing.
- One physical mark is ONE asset. Front and side, or back and side, often show two pieces of the same chest logo, sleeve graphic, sleeve text, name, or number because the camera angle cuts it off. Those pieces are the same mark. List it ONCE, on the cell that shows the largest part. Never list the cropped piece on a neighboring view as a second decoration.

Critical rules for colors:
- fillColors are the garment fabric zones only (not printed marks and not the white sheet background). If catalog color zones are provided above, return one entry per visible catalog color zone using that zone's human name as "role" (for example "BODY COLOR", "ACCENT 1", "ACCENT 2", "BUTTON COLOR"). If no catalog color zones are provided, use "PRIMARY", "SECOND", "THIRD" for the visible fabric colors.
- Each decoration's colors array contains ONLY the inks that draw that one mark (its strokes, fills, and outlines). Do not copy the surrounding garment fabric color into a mark unless that mark itself is printed in that color. White counts only when it is a drawn stroke, fill, or outline of the mark.
- Every color has a short uppercase name and a hex of #RRGGBB matched to those pixels.

Return ONLY strict JSON, no markdown fences:
{
  "fillColors": [
    { "role": string, "name": string, "hex": string }
  ],
  "teamDecoration": [
    {
      "cell": "front" | "back" | "left" | "right",
      "locationCode": string,
      "kind": "logo" | "text",
      "view": string,
      "colors": [{ "name": string, "hex": string }],
      "prompt": string,
      "place": { "fromTop": number, "fromCenter": number, "width": number, "height": number },
      "fit": { "widthIn": number, "heightIn": number, "upIn": number, "downIn": number, "leftIn": number, "rightIn": number }
    }
  ],
  "rosterDecoration": [
    {
      "cell": "front" | "back" | "left" | "right",
      "locationCode": string,
      "kind": "number" | "name",
      "view": string,
      "colors": [{ "name": string, "hex": string }],
      "prompt": string,
      "place": { "fromTop": number, "fromCenter": number, "width": number, "height": number },
      "fit": { "widthIn": number, "heightIn": number, "upIn": number, "downIn": number, "leftIn": number, "rightIn": number }
    }
  ]
}

Field rules:
- cell: the sheet quadrant where that mark is clearest ("front", "back", "left", or "right").
- locationCode: when catalog locations are provided above, pick the matching catalog location code (such as "m1", "m2", "m6", "m14", "m15" for logos or "t2", "t7", "t8", "t21", "t23", "t24" for text/numbers/names). Leave "" if no catalog locations are provided.
- kind: "logo" for graphics/emblems/crests/flags, "text" for team wordmarks/sleeve initials, "number" for roster player numbers, "name" for roster player names.
- view: when catalog locations are provided, use the exact catalog location name in uppercase followed by:
  - "SUBLIMATION" for teamDecoration (for example "FRONT CENTER SUBLIMATION", "UPPER LEFT CHEST SUBLIMATION", "RIGHT SHORT SLEEVE SUBLIMATION", "LEFT SHORT SLEEVE SUBLIMATION")
  - "SUBLIMATION NUMBER" for roster numbers (for example "LOWER LEFT CHEST SUBLIMATION NUMBER", "BACK CENTER SUBLIMATION NUMBER")
  - "SUBLIMATION NAME" for roster names (for example "BACK UPPER CENTER SUBLIMATION NAME")
  Do not put artwork descriptions (like LOGO, CREST, PATCH, FLAG) inside view.
- prompt: tells an image editor, which will also receive this 2x2 sheet, to isolate and reproduce ONLY that one mark centered on a plain white background (#FFFFFF) with a white margin. Name the mark and its placement. If the cell cuts it off, say to complete it from the neighboring cell. Say not to draw the garment or any other mark.
- place: fractions of the garment outline in that cell. fromTop is 0 at collar/waistband and 1 at hem. fromCenter is -1 at wearer's right edge, 0 on midline, 1 at wearer's left edge. width and height are 0 to 1.
- fit: print size in inches for the gender and size named above. If the mark maps to a catalog text_location that lists allowed inch heights (params), choose heightIn from those allowed inch heights. For numbers, heightIn is the sentinel height. For names and team text, heightIn is the letter height. upIn, downIn, leftIn, rightIn are ADJ offsets (0 when centered in that location).
```
</details>

### 11. Draw each mark on white

| | |
|---|---|
| **Input** | The 2x2 sheet (uploaded to Magnific once) and the marks from step 10 |
| **Magnific call** | `gpt-image-2-edit` once per mark, `aspect_ratio: "square_1_1"`, reference = the sheet. Marks are sent in two batches (first half, then second half). |
| **Output** | One PNG per mark, named like `team-front-center-full-sublimation.png`. Almost-blank results (under 1% ink) are thrown away. |
| **Not redrawn** | The front and back pictures for the PDF are crops of the approved sheet. |
| **Notes** | No marks → Magnific isn't called. One failed mark fails the whole job. Drawn marks can still have spelling mistakes. |

<details>
<summary>Prompt sent to Magnific — per mark (lambda/src/decorations.ts)</summary>

The first line is the `prompt` OpenAI wrote for that mark in step 10. The rest is added by the code:

```text
{prompt from step 10}
The attached image is the 2x2 sheet. Reproduce only this one mark. It is clearest in the {cell} cell. If that cell cuts it off, complete it from the neighboring cell where the same mark continues. Its placement is {view}. Output the full mark, not a cropped fragment.
```
</details>

### 12. Build the proof PDF

| | |
|---|---|
| **Input** | Fill colors, marks with their images, front/back crops, style, garment name, size, customer name and message |
| **Pages** | **Page 1:** order summary, front and back, style, size, design name, fill colors. **Page 2+:** team marks, then roster marks (placement, code, art, colors, size). **Last page:** roster table and the customer's name and message. |
| **Sample values** | REF#, ecom order #, artist, quantity, and player number/name are not real yet. They are drawn on a red background. |
| **Output** | `{jobId}/proof.pdf` and `{jobId}/status.json` |

```json
{ "state": "done", "pdf": "job-2026-10-16T21-04-00Z_<uuid>/proof.pdf", "at": "2026-10-16T21:06:12.000Z" }
```

On any error: `{ "state": "failed", "error": "<message>", "at": "..." }`.

---

## "View in 3D" button

`POST /api/upload-ai-design/model` — separate from matching and the proof.

| | |
|---|---|
| **Input** | form: `front`, `back`, `left`, `right` (the four views) |
| **Call** | Magnific MCP server (`mcp.magnific.com`): uploads the four views, then tool `models3d_generate` with `{ model: "tripo-v31", views, textureQuality: "standard", faceLimit: 50000 }`. **No text prompt.** |
| **Output** | `model.glb` (`model/gltf-binary`) |
| **Errors** | `503` MCP credentials missing · `502` anything else |

---

## When it stops

| Step | Why | What the customer sees |
|---|---|---|
| 3 | Garment can't be made (one-piece, dress, …) | The reason from OpenAI |
| 3 | Photo couldn't be read after 2 tries | "An artist needs to review it." |
| 5 | No catalog pictures found | "No matching style was found in our catalog." |
| 6 | Not confident, or no style fits | The reason, or "An artist needs to review this design." |
| 7 | Magnific failed | "Could not generate the other views." |
| 4, 6 | Catalog search Lambda is down or rejects the key | `/search` failing → "Could not generate the other views." `/colors/nearest` failing is not a stop: the local color list is used. |
| 9–12 | Anything fails in the proof Lambda | Nothing. `status.json` says `failed`. |

---

## Settings (`.env`)

| Setting | What it's for |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI (model defaults to `gpt-6-sol`) |
| `MAGNIFIC_API_KEY` | Magnific image edits |
| `MAGNIFIC_MCP_CLIENT_ID`, `MAGNIFIC_MCP_REFRESH_TOKEN` | Only the 3D button |
| `MOMENTEC_CATALOG_SEARCH_URL`, `CATALOG_API_KEY` | Catalog search Lambda: its function URL ending in `/search`, and the key sent as `X-API-Key` |
| `GARMENT_IMAGE_URL` | Where the blank 3D pictures come from |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Upload to S3 and start the Lambda |
| `PROOF_BUCKET`, `PROOF_FUNCTION_NAME` | Which bucket and Lambda to use |

The proof Lambda has its own settings: `PROOF_BUCKET`, `OPENAI_API_KEY`, `MAGNIFIC_API_KEY`, `OPENAI_MODEL`.

---

## Where the code lives

| What | File |
|---|---|
| The upload page | `app/upload-ai-design/UploadAiDesignModal.tsx` |
| Step 1 | `lib/client-image.ts` |
| Step 2 | `app/api/upload-ai-design/suggest/route.ts`, `lib/suggest-fit.ts` |
| Steps 3–6 | `lib/catalog-match.ts` (+ `lib/colors.ts`, `lib/match-decision.ts`, `lib/manufacture-limits.ts`) |
| Step 7 | `app/api/upload-ai-design/generate/route.ts`, `lib/upload-ai-sheet.ts`, `lib/magnific.ts` |
| Step 8 | `app/api/upload-ai-design/submit/route.ts`, `lib/proof-job.ts` |
| Steps 9–12 | `lambda/src/index.ts`, `lambda/src/decorations.ts`, `lambda/src/proof.ts` |
| 3D button | `app/api/upload-ai-design/model/route.ts`, `lib/upload-ai-assets.ts` |
| Catalog search Lambda | `Momentec_VectorEmbeddings/` (separate FastAPI app, gitignored; build steps in `docs/aws.md`) |

---

## Not built yet

- Telling anyone when the PDF is ready
- PMS or CMYK colors on the PDF
- Real REF#, ecom order #, artist, quantity, and roster data
- A queue or Step Functions
- Login or auth on the public routes
- A way for the customer to download the PDF

---

## Good to know

1. **Step 2 uses the original photo**, not the cutout, and runs at the same time as the background removal.
2. **All ready photos go to Magnific** in step 7, not just the first one. Only the first photo is used for steps 2 and 3.
3. **"Apply this edit" sends the four current views**, not the original photo. It reuses the saved plan and clears the customer note.
4. **Only tonal colors are skipped** when snapping colors. Camo colors are not skipped.
5. **The customer's name and message are on the last PDF page.** QTY and the roster player number and name are still sample values.
6. **If one mark fails to draw in step 11, the whole proof job fails.**
7. **`/match` exists but the page never calls it.**
8. **`scripts/create-aws-proof.sh` is out of date.** It still says Node 20 and `us-east-1`, and was not used to set up the live system. The live setup is in `docs/aws.md`.
9. **Timing risk:** `/generate` has a 300-second limit, and a slow run (search + OpenAI + up to 300 s of Magnific) can go past it.
